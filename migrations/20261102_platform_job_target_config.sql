-- Preserve the existing production target while allowing an explicitly
-- configured local/Staging target held in Vault. No request can choose a URL.
begin;

create or replace function private.invoke_netexpert_job(task text)
returns bigint language plpgsql security definer set search_path=private,vault,net as $$
declare
  secret text;
  base_url text;
  request_id bigint;
begin
  if task not in ('monitor','subscriptions') then raise exception 'INVALID_JOB'; end if;
  select decrypted_secret into secret from vault.decrypted_secrets
  where name='netexpert_platform_cron';
  if secret is null then raise exception 'JOB_SECRET_MISSING'; end if;
  select decrypted_secret into base_url from vault.decrypted_secrets
  where name='netexpert_platform_job_base_url';
  base_url := coalesce(base_url,'https://www.netexpert.dev');
  if base_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?$'
    and base_url <> 'http://host.docker.internal:3015'
    then raise exception 'JOB_TARGET_NOT_ALLOWED'; end if;
  select net.http_get(
    url=>base_url||'/api/jobs/platform?task='||task,
    headers=>jsonb_build_object('x-platform-token',secret),
    timeout_milliseconds=>60000
  ) into request_id;
  return request_id;
end $$;
revoke all on function private.invoke_netexpert_job(text)
  from public,anon,authenticated,service_role;

commit;
