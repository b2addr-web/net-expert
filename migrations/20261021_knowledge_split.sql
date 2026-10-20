-- Additive split of the existing knowledge area. No existing item or object is moved.
begin;

alter table public.member_permissions drop constraint if exists member_permissions_section_check;
alter table public.member_permissions add constraint member_permissions_section_check
  check (section in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files'));

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files') and exists(
 select 1 from public.organization_members m where m.organization_id=public.current_organization_id() and m.user_id=auth.uid() and m.status='active' and
 (m.role='company_admin' or (section_name<>'administration' and coalesce(
   (select p.allowed from public.member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),
   (select p.allowed from public.member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section='notes' and section_name='files'),
   case when m.role='manager' then section_name in ('sim','assets','purchasing','reports','exports') when m.role='operator' then section_name in ('sim','assets','purchasing') else section_name in ('sim','assets','reports') end))))
 $$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
 'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end)
 from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files']) s))
 from public.organization_members m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid()
 order by (m.organization_id=public.current_organization_id()) desc,m.joined_at limit 1
 $$;

create or replace function public.list_organization_members()
returns table(user_id uuid,email text,full_name text,department text,role text,status text,joined_at timestamptz,permissions jsonb)
language sql stable security definer set search_path=public as $$
 select m.user_id,p.email,p.full_name,m.department,m.role,m.status,m.joined_at,
 (select jsonb_object_agg(s,case when m.role='company_admin' then true when s='administration' then false else coalesce(
   (select mp.allowed from public.member_permissions mp where mp.organization_id=m.organization_id and mp.user_id=m.user_id and mp.section=s),
   (select mp.allowed from public.member_permissions mp where mp.organization_id=m.organization_id and mp.user_id=m.user_id and mp.section='notes' and s='files'),
   case when m.role='manager' then s in ('sim','assets','purchasing','reports','exports') when m.role='operator' then s in ('sim','assets','purchasing') else s in ('sim','assets','reports') end) end)
 from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration','subscriptions','monitoring','inventory','notes','files']) s)
 from public.organization_members m join public.profiles p on p.id=m.user_id where m.organization_id=public.current_organization_id() and public.is_company_admin() order by m.joined_at
 $$;

create table public.knowledge_folders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id), name text not null check (char_length(btrim(name)) between 1 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (organization_id,id), unique (organization_id,created_by,name)
);
create index knowledge_folders_owner on public.knowledge_folders(organization_id,created_by,name);
alter table public.knowledge_folders enable row level security;
grant select,insert,update,delete on public.knowledge_folders to authenticated;
grant all on public.knowledge_folders to service_role;

create or replace function public.knowledge_folder_stamp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  new.created_by:=auth.uid(); new.created_at:=now();
 else
  new.organization_id:=old.organization_id; new.created_by:=old.created_by; new.created_at:=old.created_at;
 end if;
 new.updated_at:=now(); return new;
end $$;
create trigger knowledge_folders_stamp before insert or update on public.knowledge_folders
for each row execute function public.knowledge_folder_stamp();

create policy knowledge_folders_read on public.knowledge_folders for select to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('files'));
create policy knowledge_folders_insert on public.knowledge_folders for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('files')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));
create policy knowledge_folders_update on public.knowledge_folders for update to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('files')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'))
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('files')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));
create policy knowledge_folders_delete on public.knowledge_folders for delete to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('files')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

alter table public.knowledge_items add column item_type text not null default 'note';
alter table public.knowledge_items add column folder_id uuid;
alter table public.knowledge_items add column author_name text;
update public.knowledge_items set item_type=case when file_path is not null and btrim(body)='' then 'file' else 'note' end;
update public.knowledge_items k set author_name=nullif(btrim(p.full_name),'') from public.profiles p where p.id=k.created_by;
alter table public.knowledge_items add constraint knowledge_items_type_check check (item_type in ('note','file'));
alter table public.knowledge_items add constraint knowledge_items_file_kind_check check (item_type<>'file' or file_path is not null);
alter table public.knowledge_items add constraint knowledge_items_note_folder_check check (item_type<>'note' or folder_id is null);
alter table public.knowledge_items add constraint knowledge_items_folder_fk foreign key (organization_id,folder_id)
 references public.knowledge_folders(organization_id,id) on delete restrict;
create index knowledge_items_folder on public.knowledge_items(organization_id,folder_id) where folder_id is not null;

create or replace function public.knowledge_item_stamp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  new.created_by:=auth.uid(); new.created_at:=now();
  if new.item_type='note' and new.file_path is not null and btrim(new.body)='' then
   new.item_type:='file'; -- Old combined-page uploads remain files during rollout.
  end if;
  select nullif(btrim(p.full_name),'') into new.author_name from public.profiles p where p.id=new.created_by;
 else
  new.organization_id:=old.organization_id; new.created_by:=old.created_by;
  new.created_at:=old.created_at; new.author_name:=old.author_name; new.item_type:=old.item_type;
  new.file_path:=old.file_path; new.file_size:=old.file_size;
 end if;
 if new.folder_id is not null and not exists (
  select 1 from public.knowledge_folders f where f.id=new.folder_id and f.organization_id=new.organization_id and f.created_by=new.created_by
 ) then raise exception 'INVALID_KNOWLEDGE_FOLDER'; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger knowledge_items_stamp before insert or update on public.knowledge_items
for each row execute function public.knowledge_item_stamp();

drop policy knowledge_read on public.knowledge_items;
create policy knowledge_read on public.knowledge_items for select to authenticated
 using (organization_id=public.current_organization_id() and
  (case when item_type='file' then public.has_section_access('files') else public.has_section_access('notes') end) and
  (created_by=(select auth.uid()) or shared_with_team));
drop policy knowledge_insert on public.knowledge_items;
create policy knowledge_insert on public.knowledge_items for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and
  (case when item_type='file' then public.has_section_access('files') else public.has_section_access('notes') end) and
  (public.get_my_access()->>'role') in ('company_admin','operator','manager') and
  (file_path is null or file_path like organization_id::text||'/'||created_by::text||'/%'));
drop policy knowledge_update on public.knowledge_items;
create policy knowledge_update on public.knowledge_items for update to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and
  (case when item_type='file' then public.has_section_access('files') else public.has_section_access('notes') end) and
  (public.get_my_access()->>'role') in ('company_admin','operator','manager'))
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and
  (case when item_type='file' then public.has_section_access('files') else public.has_section_access('notes') end) and
  (public.get_my_access()->>'role') in ('company_admin','operator','manager') and
  (file_path is null or file_path like organization_id::text||'/'||created_by::text||'/%'));
drop policy knowledge_delete on public.knowledge_items;
create policy knowledge_delete on public.knowledge_items for delete to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and
  (case when item_type='file' then public.has_section_access('files') else public.has_section_access('notes') end) and
  (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

drop policy knowledge_file_upload on storage.objects;
create policy knowledge_file_upload on storage.objects for insert to authenticated
 with check (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and (storage.foldername(name))[2]=(select auth.uid())::text
 and (public.has_section_access('notes') or public.has_section_access('files'))
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));
drop policy knowledge_file_download on storage.objects;
create or replace function public.knowledge_storage_readable(object_name text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item record;
begin
 select organization_id,created_by,shared_with_team,item_type into item
 from public.knowledge_items where file_path=object_name;
 if found then
  return item.organization_id=public.current_organization_id()
   and (item.created_by=auth.uid() or item.shared_with_team)
   and public.has_section_access(case when item.item_type='file' then 'files' else 'notes' end);
 end if;
 -- A writer may clean up only their own orphaned upload.
 return (storage.foldername(object_name))[1]=public.current_organization_id()::text
   and (storage.foldername(object_name))[2]=auth.uid()::text
   and (public.has_section_access('notes') or public.has_section_access('files'))
   and (public.get_my_access()->>'role') in ('company_admin','operator','manager');
end $$;
revoke all on function public.knowledge_storage_readable(text) from public;
grant execute on function public.knowledge_storage_readable(text) to authenticated,service_role;
create policy knowledge_file_download on storage.objects for select to authenticated
 using (bucket_id='knowledge-files' and public.knowledge_storage_readable(name));
drop policy knowledge_file_cleanup on storage.objects;
create policy knowledge_file_cleanup on storage.objects for delete to authenticated
 using (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and (storage.foldername(name))[2]=(select auth.uid())::text
 and (public.has_section_access('notes') or public.has_section_access('files'))
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

commit;
