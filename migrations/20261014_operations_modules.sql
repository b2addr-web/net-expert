-- Add independent operational modules. Existing records and policies are retained.
begin;

alter table public.member_permissions drop constraint if exists member_permissions_section_check;
alter table public.member_permissions add constraint member_permissions_section_check
  check (section in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory'));

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory') and exists(
 select 1 from organization_members m where m.organization_id=current_organization_id() and m.user_id=auth.uid() and m.status='active' and
 (m.role='company_admin' or (section_name<>'administration' and coalesce((select allowed from member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),case when m.role='manager' then section_name in ('sim','assets','purchasing','reports','exports') when m.role='operator' then section_name in ('sim','assets','purchasing') else section_name in ('sim','assets','reports') end))))
 $$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
 'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end)
 from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory']) s))
 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid()
 order by (m.organization_id=public.current_organization_id()) desc,m.joined_at limit 1
 $$;

create or replace function public.list_organization_members()
returns table(user_id uuid,email text,full_name text,department text,role text,status text,joined_at timestamptz,permissions jsonb)
language sql stable security definer set search_path=public as $$
 select m.user_id,p.email,p.full_name,m.department,m.role,m.status,m.joined_at,
 (select jsonb_object_agg(s,case when m.role='company_admin' then true when s='administration' then false else coalesce((select mp.allowed from member_permissions mp where mp.organization_id=m.organization_id and mp.user_id=m.user_id and mp.section=s),case when m.role='manager' then s in ('sim','assets','purchasing','reports','exports') when m.role='operator' then s in ('sim','assets','purchasing') else s in ('sim','assets','reports') end) end) from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory']) s)
 from organization_members m join profiles p on p.id=m.user_id where m.organization_id=current_organization_id() and is_company_admin() order by m.joined_at
 $$;

create table public.service_subscriptions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 160), provider text not null check(length(trim(provider)) between 1 and 160),
 description text not null default '' check(length(description)<=2000), start_date date not null, end_date date not null,
 cost numeric(14,2) not null check(cost>=0), currency text not null default 'SAR' check(currency~'^[A-Z]{3}$'),
 billing_cycle text not null check(billing_cycle in ('monthly','yearly','custom')),
 license_count integer check(license_count>=0), notes text not null default '' check(length(notes)<=3000), auto_renew boolean not null default false,
 version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_date>=start_date)
);
create index service_subscriptions_org_end on public.service_subscriptions(organization_id,end_date);
create unique index service_subscriptions_no_duplicate on public.service_subscriptions(organization_id,lower(name),lower(provider),start_date,end_date);

create table public.monitor_sites (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 160), url text not null check(length(url)<=2048), description text not null default '' check(length(description)<=2000),
 domain_name text not null, check_interval_minutes integer not null default 5 check(check_interval_minutes in (5,10,15,30,60)),
 slow_threshold_ms integer not null default 3000 check(slow_threshold_ms between 100 and 30000), enabled boolean not null default true,
 hosting_provider text not null default '' check(length(hosting_provider)<=160), hosting_expires_on date, domain_expires_manual date,
 domain_expires_on date, domain_source text not null default 'unavailable' check(domain_source in ('rdap','manual','unavailable')),
 domain_checked_at timestamptz, ssl_expires_at timestamptz, ssl_status text not null default 'unknown' check(ssl_status in ('valid','invalid','unknown')),
 status text not null default 'unchecked' check(status in ('unchecked','online','down','degraded')),
 http_status integer, response_ms integer, last_checked_at timestamptz, check_lease_until timestamptz,
 failure_streak integer not null default 0, slow_streak integer not null default 0,
 version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,url)
);
create index monitor_sites_due on public.monitor_sites(enabled,last_checked_at,check_lease_until);

create table public.monitor_checks (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
 site_id uuid not null references public.monitor_sites(id) on delete cascade, checked_at timestamptz not null default now(),
 result text not null check(result in ('online','down','degraded')), http_status integer, response_ms integer check(response_ms>=0),
 error_type text, ssl_status text, ssl_expires_at timestamptz
);
create index monitor_checks_site_time on public.monitor_checks(site_id,checked_at desc);

create table public.monitor_incidents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 site_id uuid not null references public.monitor_sites(id) on delete cascade, started_at timestamptz not null, ended_at timestamptz,
 duration_seconds integer, reason text, created_at timestamptz not null default now(), check(ended_at is null or ended_at>=started_at)
);
create unique index monitor_incidents_one_open on public.monitor_incidents(site_id) where ended_at is null;
create index monitor_incidents_site_time on public.monitor_incidents(site_id,started_at desc);

create view public.monitor_site_statistics with (security_invoker=true) as
select s.organization_id,s.id as site_id,
 (select round(avg(c.response_ms))::integer from public.monitor_checks c where c.site_id=s.id and c.checked_at>=now()-interval '24 hours' and c.response_ms is not null) as avg_response_24h,
 (select round(100.0*count(*) filter(where c.result<>'down')/nullif(count(*),0),2) from public.monitor_checks c where c.site_id=s.id and c.checked_at>=now()-interval '30 days') as uptime_percent_30d,
 (select count(*) from public.monitor_checks c where c.site_id=s.id and c.checked_at>=now()-interval '30 days') as checks_30d,
 (select coalesce(sum(extract(epoch from least(coalesce(i.ended_at,now()),now())-greatest(i.started_at,now()-interval '24 hours'))),0)::bigint from public.monitor_incidents i where i.site_id=s.id and i.started_at<now() and coalesce(i.ended_at,now())>now()-interval '24 hours') as downtime_24h_seconds,
 (select coalesce(sum(extract(epoch from least(coalesce(i.ended_at,now()),now())-greatest(i.started_at,now()-interval '7 days'))),0)::bigint from public.monitor_incidents i where i.site_id=s.id and i.started_at<now() and coalesce(i.ended_at,now())>now()-interval '7 days') as downtime_7d_seconds,
 (select coalesce(sum(extract(epoch from least(coalesce(i.ended_at,now()),now())-greatest(i.started_at,now()-interval '30 days'))),0)::bigint from public.monitor_incidents i where i.site_id=s.id and i.started_at<now() and coalesce(i.ended_at,now())>now()-interval '30 days') as downtime_30d_seconds
from public.monitor_sites s;

create table public.inventory_items (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 160), category text not null check(length(trim(category)) between 1 and 100),
 brand text not null check(length(trim(brand)) between 1 and 120), model text not null default '' check(length(model)<=120),
 quantity integer not null default 0 check(quantity>=0), min_quantity integer not null default 0 check(min_quantity>=0),
 storage_location text not null default '' check(length(storage_location)<=160), sku text check(length(sku)<=100),
 notes text not null default '' check(length(notes)<=3000), version integer not null default 1,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index inventory_items_org_sku on public.inventory_items(organization_id,lower(sku)) where sku is not null and sku<>'';
create unique index inventory_items_no_duplicate on public.inventory_items(organization_id,lower(name),lower(brand),lower(model),lower(storage_location));
create index inventory_items_org_category on public.inventory_items(organization_id,category);

create table public.platform_notification_log (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null, resource_id uuid not null, event_key text not null, recipient_email text not null,
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 attempts integer not null default 1, sent_at timestamptz, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,kind,resource_id,event_key,recipient_email)
);

create table public.platform_job_runs (
 task text primary key check(task in ('monitor','subscriptions')),
 last_run_at timestamptz not null default now(), status text not null check(status in ('success','failed')),
 processed integer not null default 0, error_code text
);

alter table public.service_subscriptions enable row level security;
alter table public.monitor_sites enable row level security;
alter table public.monitor_checks enable row level security;
alter table public.monitor_incidents enable row level security;
alter table public.inventory_items enable row level security;
alter table public.platform_notification_log enable row level security;
alter table public.platform_job_runs enable row level security;
create policy service_subscriptions_read on public.service_subscriptions for select to authenticated using(organization_id=public.current_organization_id() and public.has_section_access('subscriptions'));
create policy monitor_sites_read on public.monitor_sites for select to authenticated using(organization_id=public.current_organization_id() and public.has_section_access('monitoring'));
create policy monitor_checks_read on public.monitor_checks for select to authenticated using(organization_id=public.current_organization_id() and public.has_section_access('monitoring'));
create policy monitor_incidents_read on public.monitor_incidents for select to authenticated using(organization_id=public.current_organization_id() and public.has_section_access('monitoring'));
create policy inventory_items_read on public.inventory_items for select to authenticated using(organization_id=public.current_organization_id() and public.has_section_access('inventory'));
-- All writes pass through authenticated Next.js API routes with server-side role, scope and input validation.
revoke all on public.service_subscriptions,public.monitor_sites,public.monitor_checks,public.monitor_incidents,public.inventory_items,public.platform_notification_log from anon,authenticated;
revoke all on public.platform_job_runs from anon,authenticated;
grant select on public.service_subscriptions,public.monitor_sites,public.monitor_checks,public.monitor_incidents,public.inventory_items to authenticated;
revoke all on public.monitor_site_statistics from anon,authenticated;
grant select on public.monitor_site_statistics to service_role;

commit;
