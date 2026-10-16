-- Additive monitoring upgrade. Existing sites, checks, incidents and alerts are retained.
alter table public.monitor_sites
  add column if not exists expected_content text,
  add column if not exists alert_emails text[] not null default '{}',
  add column if not exists recovery_streak integer not null default 0;

alter table public.monitor_sites
  add constraint monitor_sites_expected_content_length check (expected_content is null or length(expected_content) between 1 and 200),
  add constraint monitor_sites_alert_emails_count check (cardinality(alert_emails) <= 10),
  add constraint monitor_sites_recovery_streak_range check (recovery_streak between 0 and 100);

alter table public.monitor_sites drop constraint monitor_sites_check_interval_minutes_check;
alter table public.monitor_sites add constraint monitor_sites_check_interval_minutes_check
  check (check_interval_minutes = any (array[1,5,10,15,30,60]));

alter table public.monitor_incidents
  add column if not exists resolution_note text,
  add column if not exists note_updated_at timestamptz,
  add column if not exists note_updated_by uuid references auth.users(id);
alter table public.monitor_incidents
  add constraint monitor_incidents_resolution_note_length
  check (resolution_note is null or length(resolution_note) <= 3000);

create index if not exists monitor_checks_org_site_time_idx
  on public.monitor_checks (organization_id,site_id,checked_at desc);
create index if not exists monitor_incidents_org_site_time_idx
  on public.monitor_incidents (organization_id,site_id,started_at desc);

-- Existing RLS policies and grants remain intact.

create or replace function public.monitor_check_rollup(p_org uuid,p_site uuid,p_since timestamptz,p_bucket_minutes integer)
returns table(bucket timestamptz,check_count bigint,available_count bigint,down_count bigint,response_count bigint,avg_response_ms numeric,max_response_ms integer)
language sql stable security invoker set search_path = public
as $$
  select date_bin(make_interval(mins => p_bucket_minutes), c.checked_at, '2000-01-01'::timestamptz) as bucket,
    count(*) as check_count,
    count(*) filter (where c.result in ('online','degraded')) as available_count,
    count(*) filter (where c.result = 'down') as down_count,
    count(c.response_ms) as response_count,
    round(avg(c.response_ms),1) as avg_response_ms,
    max(c.response_ms) as max_response_ms
  from public.monitor_checks c
  where c.organization_id=p_org and c.site_id=p_site and c.checked_at>=p_since
    and p_bucket_minutes in (60,360,1440)
  group by 1 order by 1;
$$;
revoke all on function public.monitor_check_rollup(uuid,uuid,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.monitor_check_rollup(uuid,uuid,timestamptz,integer) to service_role;
