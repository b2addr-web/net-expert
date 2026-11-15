begin;

alter table public.signature_requests add column if not exists whatsapp_consent_confirmed boolean not null default false;

alter table public.member_permissions drop constraint if exists member_permissions_section_check;
alter table public.member_permissions add constraint member_permissions_section_check check
 (section in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files','contracts','signatures','whatsapp'));

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files','contracts','signatures','whatsapp')
 and exists (select 1 from public.organization_members m where m.organization_id=public.current_organization_id() and m.user_id=auth.uid() and m.status='active'
   and (m.role='company_admin' or (section_name<>'administration' and coalesce(
     (select p.allowed from public.member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),
     (select p.allowed from public.member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section='notes' and section_name='files'),
     case when m.role='manager' then section_name in ('sim','assets','purchasing','reports','exports','notes','files') when m.role='operator' then section_name in ('sim','assets','purchasing','notes','files') else section_name in ('sim','assets','reports','notes','files') end))));
$$;

create or replace function public.get_my_access() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
   'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end) from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files','contracts','signatures','whatsapp']) s))
 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid() order by (m.organization_id=public.current_organization_id()) desc,m.joined_at limit 1;
$$;

create table public.whatsapp_accounts (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
 account_kind text not null check (account_kind in ('netexpert','company')), display_phone text, phone_number_id text, business_account_id text,
 status text not null default 'disconnected' check (status in ('disconnected','pending','connected','error')), last_error text,
 connected_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((account_kind='netexpert' and organization_id is null) or (account_kind='company' and organization_id is not null)), unique (organization_id,account_kind));
create unique index whatsapp_accounts_phone_number on public.whatsapp_accounts(phone_number_id) where phone_number_id is not null;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table private.whatsapp_credentials (account_id uuid primary key references public.whatsapp_accounts(id) on delete cascade, access_token_ciphertext text not null, encryption_version smallint not null default 1, updated_at timestamptz not null default now());
revoke all on private.whatsapp_credentials from public,anon,authenticated;
grant all on private.whatsapp_credentials to service_role;

create table public.whatsapp_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade, mode text not null default 'netexpert' check (mode in ('netexpert','company')),
 account_id uuid references public.whatsapp_accounts(id) on delete restrict, enabled boolean not null default false, template_name text,
 template_language text not null default 'ar', template_status text not null default 'unconfigured' check (template_status in ('unconfigured','pending','approved','rejected')),
 recipient_consent_required boolean not null default true, updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 check ((mode='netexpert' and account_id is null) or mode='company'), check (enabled=false or template_status='approved'));

create table public.whatsapp_message_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade, name text not null,
 provider_template_name text not null, language text not null default 'ar', status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique (organization_id,name));

create table public.whatsapp_send_jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 signature_request_id uuid not null unique references public.signature_requests(id) on delete cascade, account_id uuid references public.whatsapp_accounts(id) on delete restrict,
 idempotency_key text not null unique, status text not null default 'pending' check (status in ('pending','processing','uncertain','accepted','delivered','read','failed')),
 provider_message_id text, attempts integer not null default 0 check (attempts >= 0), last_error text, next_attempt_at timestamptz,
 accepted_at timestamptz, delivered_at timestamptz, read_at timestamptz, locked_until timestamptz, lock_token uuid, uncertain_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index whatsapp_send_jobs_queue on public.whatsapp_send_jobs(status,next_attempt_at);
create unique index whatsapp_send_jobs_provider_id on public.whatsapp_send_jobs(provider_message_id) where provider_message_id is not null;

create or replace function public.claim_whatsapp_send_job(p_worker_id uuid, p_now timestamptz default now())
returns setof public.whatsapp_send_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed public.whatsapp_send_jobs;
begin
  with candidate as (
    select id from public.whatsapp_send_jobs
    where (status='pending' and (next_attempt_at is null or next_attempt_at<=p_now))
       or (status='processing' and locked_until is not null and locked_until<p_now)
    order by created_at for update skip locked limit 1
  )
  update public.whatsapp_send_jobs j set status='processing',lock_token=p_worker_id,locked_until=p_now+interval '90 seconds',attempts=j.attempts+1,updated_at=p_now
  from candidate where j.id=candidate.id returning j.* into claimed;
  if claimed.id is not null then return next claimed; end if;
  return;
end; $$;
revoke all on function public.claim_whatsapp_send_job(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_send_job(uuid,timestamptz) to service_role;

create table public.whatsapp_webhook_events (id uuid primary key default gen_random_uuid(), account_id uuid references public.whatsapp_accounts(id) on delete set null,
 provider_event_id text not null unique, payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'), event_type text not null, processed_at timestamptz, created_at timestamptz not null default now());

alter table public.whatsapp_accounts enable row level security; alter table public.whatsapp_settings enable row level security; alter table public.whatsapp_message_templates enable row level security; alter table public.whatsapp_send_jobs enable row level security; alter table public.whatsapp_webhook_events enable row level security;
grant select,insert,update,delete on public.whatsapp_accounts,public.whatsapp_settings,public.whatsapp_message_templates,public.whatsapp_send_jobs to authenticated;
grant all on public.whatsapp_accounts,public.whatsapp_settings,public.whatsapp_message_templates,public.whatsapp_send_jobs,public.whatsapp_webhook_events to service_role;
revoke all on public.whatsapp_webhook_events from anon,authenticated; revoke all on public.whatsapp_accounts,public.whatsapp_settings,public.whatsapp_message_templates,public.whatsapp_send_jobs from anon;

create policy whatsapp_accounts_read on public.whatsapp_accounts for select to authenticated using (account_kind='company' and organization_id=public.current_organization_id() and public.has_section_access('whatsapp'));
create policy whatsapp_accounts_write on public.whatsapp_accounts for all to authenticated using (account_kind='company' and organization_id=public.current_organization_id() and public.has_section_access('whatsapp')) with check (account_kind='company' and organization_id=public.current_organization_id() and public.has_section_access('whatsapp'));
create policy whatsapp_settings_all on public.whatsapp_settings for all to authenticated using (organization_id=public.current_organization_id() and public.has_section_access('whatsapp')) with check (organization_id=public.current_organization_id() and public.has_section_access('whatsapp'));
create policy whatsapp_templates_all on public.whatsapp_message_templates for all to authenticated using ((organization_id is null or organization_id=public.current_organization_id()) and public.has_section_access('whatsapp')) with check ((organization_id is null or organization_id=public.current_organization_id()) and created_by=auth.uid() and public.has_section_access('whatsapp'));
create policy whatsapp_jobs_read on public.whatsapp_send_jobs for select to authenticated using (organization_id=public.current_organization_id() and public.has_section_access('signatures'));

create or replace function public.queue_signature_whatsapp_job() returns trigger language plpgsql security definer set search_path=public,private as $$
begin
  insert into public.whatsapp_send_jobs(organization_id,signature_request_id,account_id,idempotency_key,status)
  select new.organization_id,new.id,case when s.mode='company' then s.account_id else null end,
         'signature:'||new.id::text,'pending'
    from public.whatsapp_settings s where s.organization_id=new.organization_id
  on conflict (signature_request_id) do nothing;
  if not found then
    insert into public.whatsapp_send_jobs(organization_id,signature_request_id,idempotency_key,status)
    values(new.organization_id,new.id,'signature:'||new.id::text,'pending') on conflict (signature_request_id) do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.queue_signature_whatsapp_job() from public,anon,authenticated;
create trigger signature_request_whatsapp_queue after insert on public.signature_requests for each row execute function public.queue_signature_whatsapp_job();

commit;
