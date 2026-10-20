-- Independent knowledge area. Existing records and files are untouched.
begin;

alter table public.member_permissions drop constraint if exists member_permissions_section_check;
alter table public.member_permissions add constraint member_permissions_section_check
  check (section in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes'));

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes') and exists(
 select 1 from organization_members m where m.organization_id=current_organization_id() and m.user_id=auth.uid() and m.status='active' and
 (m.role='company_admin' or (section_name<>'administration' and coalesce((select allowed from member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),case when m.role='manager' then section_name in ('sim','assets','purchasing','reports','exports') when m.role='operator' then section_name in ('sim','assets','purchasing') else section_name in ('sim','assets','reports') end))))
 $$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
 'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end)
 from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes']) s))
 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid()
 order by (m.organization_id=public.current_organization_id()) desc,m.joined_at limit 1
 $$;

create or replace function public.list_organization_members()
returns table(user_id uuid,email text,full_name text,department text,role text,status text,joined_at timestamptz,permissions jsonb)
language sql stable security definer set search_path=public as $$
 select m.user_id,p.email,p.full_name,m.department,m.role,m.status,m.joined_at,
 (select jsonb_object_agg(s,case when m.role='company_admin' then true when s='administration' then false else coalesce((select mp.allowed from member_permissions mp where mp.organization_id=m.organization_id and mp.user_id=m.user_id and mp.section=s),case when m.role='manager' then s in ('sim','assets','purchasing','reports','exports') when m.role='operator' then s in ('sim','assets','purchasing') else s in ('sim','assets','reports') end) end) from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes']) s)
 from organization_members m join profiles p on p.id=m.user_id where m.organization_id=current_organization_id() and is_company_admin() order by m.joined_at
 $$;

create table if not exists public.knowledge_items (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 title text not null check (char_length(btrim(title)) between 1 and 160),
 body text not null default '' check (char_length(body)<=10000),
 file_path text unique,
 file_name text check (file_name is null or char_length(file_name) between 1 and 255),
 file_size bigint check (file_size is null or file_size between 1 and 10485760),
 shared_with_team boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (body<>'' or file_path is not null),
 check ((file_path is null and file_name is null and file_size is null) or (file_path is not null and file_name is not null and file_size is not null))
);
create index if not exists knowledge_items_org_created on public.knowledge_items(organization_id,created_at desc);
create index if not exists knowledge_items_org_shared on public.knowledge_items(organization_id,shared_with_team) where shared_with_team;
alter table public.knowledge_items enable row level security;
grant select,insert,update,delete on public.knowledge_items to authenticated;

create policy knowledge_read on public.knowledge_items for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('notes') and (created_by=(select auth.uid()) or shared_with_team));
create policy knowledge_insert on public.knowledge_items for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes')
 and (file_path is null or file_path like organization_id::text||'/'||created_by::text||'/%'));
create policy knowledge_update on public.knowledge_items for update to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes'))
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes')
 and (file_path is null or file_path like organization_id::text||'/'||created_by::text||'/%'));
create policy knowledge_delete on public.knowledge_items for delete to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('knowledge-files','knowledge-files',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel'])
 on conflict (id) do nothing;

create policy knowledge_file_upload on storage.objects for insert to authenticated
 with check (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and (storage.foldername(name))[2]=(select auth.uid())::text and public.has_section_access('notes'));
create policy knowledge_file_download on storage.objects for select to authenticated
 using (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and public.has_section_access('notes') and ((storage.foldername(name))[2]=(select auth.uid())::text
 or exists(select 1 from public.knowledge_items k where k.file_path=name and k.organization_id=public.current_organization_id() and k.shared_with_team)));
create policy knowledge_file_cleanup on storage.objects for delete to authenticated
 using (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and (storage.foldername(name))[2]=(select auth.uid())::text and public.has_section_access('notes'));

commit;
