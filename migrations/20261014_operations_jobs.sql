-- Supabase Cron support; scheduling is activated separately after deployment.
-- The secret is generated and stored only in Vault, never in code or cron text.
begin;
create extension if not exists pg_net with schema extensions;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

do $$begin
 if not exists(select 1 from vault.secrets where name='netexpert_platform_cron') then
  perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'netexpert_platform_cron','NetExpert protected operations scheduler');
 end if;
end$$;

create or replace function public.verify_platform_job_token(candidate text)
returns boolean language sql stable security definer set search_path=public,vault as $$
 select candidate is not null and length(candidate)>=32 and exists(
  select 1 from vault.decrypted_secrets where name='netexpert_platform_cron' and decrypted_secret=candidate)
$$;
revoke all on function public.verify_platform_job_token(text) from public,anon,authenticated;
grant execute on function public.verify_platform_job_token(text) to service_role;

create or replace function public.claim_due_monitor_sites(batch_size integer)
returns setof public.monitor_sites language plpgsql security definer set search_path=public as $$
begin
 return query
 with due as (
  select s.id from public.monitor_sites s
  where s.enabled and (s.last_checked_at is null or s.last_checked_at <= now()-make_interval(mins=>s.check_interval_minutes))
    and (s.check_lease_until is null or s.check_lease_until<now())
  order by s.last_checked_at nulls first,s.id
  limit least(greatest(batch_size,1),20) for update skip locked
 )
 update public.monitor_sites s set check_lease_until=now()+interval '2 minutes'
 from due where s.id=due.id returning s.*;
end$$;
revoke all on function public.claim_due_monitor_sites(integer) from public,anon,authenticated;
grant execute on function public.claim_due_monitor_sites(integer) to service_role;

create or replace function public.claim_platform_notification(p_org uuid,p_kind text,p_resource uuid,p_event text,p_email text)
returns boolean language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
 insert into public.platform_notification_log(organization_id,kind,resource_id,event_key,recipient_email)
 values(p_org,p_kind,p_resource,p_event,p_email)
 on conflict(organization_id,kind,resource_id,event_key,recipient_email) do update
 set status='pending',attempts=public.platform_notification_log.attempts+1,updated_at=now(),last_error=null
 where (public.platform_notification_log.status='failed' and public.platform_notification_log.attempts<3)
    or (public.platform_notification_log.status='pending' and public.platform_notification_log.updated_at<now()-interval '15 minutes' and public.platform_notification_log.attempts<3)
 returning id into claimed;
 return claimed is not null;
end$$;
revoke all on function public.claim_platform_notification(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_platform_notification(uuid,text,uuid,text,text) to service_role;

create or replace function private.invoke_netexpert_job(task text)
returns bigint language plpgsql security definer set search_path=private,vault,net as $$
declare secret text;request_id bigint;
begin
 if task not in ('monitor','subscriptions') then raise exception 'INVALID_JOB'; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='netexpert_platform_cron';
 if secret is null then raise exception 'JOB_SECRET_MISSING'; end if;
 select net.http_get(
  url=>'https://www.netexpert.dev/api/jobs/platform?task='||task,
  headers=>jsonb_build_object('x-platform-token',secret),
  timeout_milliseconds=>60000
 ) into request_id;
 return request_id;
end$$;
revoke all on function private.invoke_netexpert_job(text) from public,anon,authenticated,service_role;

commit;
