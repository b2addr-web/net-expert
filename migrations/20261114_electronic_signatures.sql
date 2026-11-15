-- Phase B: electronic signatures foundation.
-- Review-only migration. Do not run against production without approval.
-- Reuses the existing knowledge area and private knowledge-files bucket.
begin;

alter table public.member_permissions drop constraint if exists member_permissions_section_check;
alter table public.member_permissions add constraint member_permissions_section_check
  check (section in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files','contracts','signatures'));

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files','contracts','signatures')
 and exists(
   select 1 from public.organization_members m
   where m.organization_id=public.current_organization_id()
     and m.user_id=auth.uid() and m.status='active'
     and (m.role='company_admin' or (section_name<>'administration' and coalesce(
       (select p.allowed from public.member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),
       (select p.allowed from public.member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section='notes' and section_name='files'),
       case when section_name in ('signatures','contracts') then false
            when m.role='manager' then section_name in ('sim','assets','purchasing','reports','exports','notes','files')
            when m.role='operator' then section_name in ('sim','assets','purchasing','notes','files')
            else section_name in ('sim','assets','reports','notes','files') end))))
 $$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
   'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end)
   from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files','contracts','signatures']) s))
 from public.organization_members m join public.organizations o on o.id=m.organization_id
 where m.user_id=auth.uid() order by (m.organization_id=public.current_organization_id()) desc,m.joined_at limit 1
 $$;

create table public.signature_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  version integer not null default 1 check (version > 0),
  original_file_path text not null unique,
  original_file_name text not null check (char_length(original_file_name) between 1 and 160),
  original_file_size bigint not null check (original_file_size between 1 and 52428800),
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  signature_page integer not null check (signature_page >= 1),
  signature_x numeric not null check (signature_x >= 0),
  signature_y numeric not null check (signature_y >= 0),
  signature_width numeric not null check (signature_width > 0),
  signature_height numeric not null check (signature_height > 0),
  page_width numeric not null check (page_width > 0),
  page_height numeric not null check (page_height > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, version)
);
create index signature_templates_org on public.signature_templates(organization_id, active, name);

create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.signature_templates(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  employee_name text not null check (char_length(btrim(employee_name)) between 1 and 200),
  employee_id text,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  notes text,
  status text not null default 'pending_send' check (status in ('pending_send','sent','awaiting_signature','signed','send_failed','expired','cancelled')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz not null,
  whatsapp_message_id text,
  whatsapp_last_status text,
  send_attempts integer not null default 0 check (send_attempts >= 0),
  last_error text,
  signed_at timestamptz,
  signed_ip inet,
  signed_user_agent text,
  consent_text text,
  signature_file_path text,
  final_knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  final_sha256 text check (final_sha256 is null or final_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index signature_requests_org_status on public.signature_requests(organization_id, status, created_at desc);
create index signature_requests_employee on public.signature_requests(organization_id, lower(employee_name), employee_id);

create table public.signature_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.signature_requests(id) on delete cascade,
  event_type text not null check (event_type in ('created','send_attempted','sent','delivered','read','send_failed','archive_failed','opened','signed','expired','cancelled','final_file_saved')),
  provider_event_id text unique,
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index signature_events_request on public.signature_events(request_id, created_at desc);

-- Keep cross-table links tenant-consistent even for privileged server-side writes.
create or replace function public.signature_scope_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='signature_requests' then
    if not exists (select 1 from public.signature_templates t
                   where t.id=new.template_id and t.organization_id=new.organization_id) then
      raise exception 'signature template belongs to another organization';
    end if;
    if new.final_knowledge_item_id is not null and not exists (
      select 1 from public.knowledge_items k
      where k.id=new.final_knowledge_item_id
        and k.organization_id=new.organization_id and k.item_type='file') then
      raise exception 'final knowledge item belongs to another organization or is not a file';
    end if;
  elsif tg_table_name='signature_events' then
    if not exists (select 1 from public.signature_requests r
                   where r.id=new.request_id and r.organization_id=new.organization_id) then
      raise exception 'signature event request belongs to another organization';
    end if;
  end if;
  return new;
end;
$$;
create trigger signature_requests_scope_guard
  before insert or update on public.signature_requests
  for each row execute function public.signature_scope_guard();
create trigger signature_events_scope_guard
  before insert or update on public.signature_events
  for each row execute function public.signature_scope_guard();

alter table public.signature_templates enable row level security;
alter table public.signature_requests enable row level security;
alter table public.signature_events enable row level security;

grant select,insert,update,delete on public.signature_templates to authenticated;
grant select,insert,update,delete on public.signature_requests to authenticated;
grant select on public.signature_events to authenticated;
grant all on public.signature_templates,public.signature_requests,public.signature_events to service_role;

create policy signature_templates_read on public.signature_templates for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('signatures'));
create policy signature_templates_write on public.signature_templates for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=auth.uid() and public.workspace_write('signatures'));
create policy signature_templates_update on public.signature_templates for update to authenticated
 using (organization_id=public.current_organization_id() and created_by=auth.uid() and public.workspace_write('signatures'))
 with check (organization_id=public.current_organization_id() and created_by=auth.uid() and public.workspace_write('signatures'));
create policy signature_templates_delete on public.signature_templates for delete to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('signatures'));

create policy signature_requests_read on public.signature_requests for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('signatures'));
create policy signature_requests_write on public.signature_requests for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=auth.uid() and public.workspace_write('signatures'));
create policy signature_requests_update on public.signature_requests for update to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('signatures'))
 with check (organization_id=public.current_organization_id() and public.workspace_write('signatures'));

create policy signature_events_read on public.signature_events for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('signatures'));

-- Public/anonymous clients receive no table access. Signing pages and webhooks must use
-- server-side service-role code after validating a hashed token or Meta signature.
revoke all on public.signature_templates,public.signature_requests,public.signature_events from anon;

-- Existing knowledge-files remains private. Original templates are read through the
-- existing knowledge storage helper; final PDFs become knowledge_items of type file.
create or replace function public.knowledge_storage_readable(object_name text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item record; tpl record;
begin
 select organization_id,created_by,shared_with_team,item_type into item from public.knowledge_items where file_path=object_name;
 if found then
  return item.organization_id=public.current_organization_id() and (item.created_by=auth.uid() or item.shared_with_team)
   and public.has_section_access(case when item.item_type='file' then 'files' else 'notes' end);
 end if;
 select n.organization_id,n.created_by,n.shared_with_team,n.item_type into item
 from public.knowledge_attachments a join public.knowledge_items n on n.id=a.note_id
 where a.file_path=object_name;
 if found then
  return item.organization_id=public.current_organization_id() and (item.created_by=auth.uid() or item.shared_with_team)
   and item.item_type='note' and public.has_section_access('notes');
 end if;
 select organization_id,created_by into tpl from public.signature_templates where original_file_path=object_name;
 if found then
  return tpl.organization_id=public.current_organization_id() and public.has_section_access('signatures')
   and (tpl.created_by=auth.uid() or (public.get_my_access()->>'role') in ('company_admin','manager'));
 end if;
 return false;
end $$;
revoke all on function public.knowledge_storage_readable(text) from public;
grant execute on function public.knowledge_storage_readable(text) to authenticated,service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='signature_requests') then
    execute 'alter publication supabase_realtime add table public.signature_requests';
  end if;
end $$;

commit;
