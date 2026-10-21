-- Review separately. Additive migration; preserves knowledge_items.file_path legacy attachments.
begin;

create table public.knowledge_attachments (
 id uuid primary key default gen_random_uuid(),
 note_id uuid not null references public.knowledge_items(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 file_path text not null unique,
 file_name text not null check (char_length(file_name) between 1 and 160),
 file_size bigint not null check (file_size between 1 and 10485760),
 content_type text not null check (content_type in ('application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel')),
 created_at timestamptz not null default now(),
 constraint knowledge_attachments_owned_path check (file_path like organization_id::text||'/'||created_by::text||'/%')
);
create index knowledge_attachments_note_idx on public.knowledge_attachments(note_id,created_at);
alter table public.knowledge_attachments enable row level security;
grant select,insert,delete on public.knowledge_attachments to authenticated;
grant all on public.knowledge_attachments to service_role;

create or replace function public.knowledge_attachment_stamp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare parent public.knowledge_items;
begin
 select * into parent from public.knowledge_items where id=new.note_id;
 if parent.id is null or parent.item_type<>'note' then raise exception 'INVALID_NOTE_ATTACHMENT'; end if;
 if not exists (select 1 from storage.objects o where o.bucket_id='knowledge-files' and o.name=new.file_path)
 then raise exception 'ATTACHMENT_OBJECT_MISSING'; end if;
 new.organization_id:=parent.organization_id;
 new.created_by:=parent.created_by;
 new.created_at:=now();
 return new;
end $$;
create trigger knowledge_attachments_stamp before insert on public.knowledge_attachments
for each row execute function public.knowledge_attachment_stamp();
revoke all on function public.knowledge_attachment_stamp() from public;

create policy knowledge_attachments_read on public.knowledge_attachments for select to authenticated
 using (exists (select 1 from public.knowledge_items n where n.id=note_id and n.organization_id=organization_id
 and n.item_type='note' and n.organization_id=public.current_organization_id()
 and public.has_section_access('notes') and (n.created_by=(select auth.uid()) or n.shared_with_team)));
create policy knowledge_attachments_insert on public.knowledge_attachments for insert to authenticated
 with check (created_by=(select auth.uid()) and organization_id=public.current_organization_id()
 and public.has_section_access('notes') and (public.get_my_access()->>'role') in ('company_admin','operator','manager')
 and exists (select 1 from public.knowledge_items n where n.id=note_id and n.item_type='note'
 and n.organization_id=organization_id and n.created_by=(select auth.uid())));
create policy knowledge_attachments_delete on public.knowledge_attachments for delete to authenticated
 using (created_by=(select auth.uid()) and organization_id=public.current_organization_id()
 and public.has_section_access('notes') and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

-- Allow an owner to clear the old single attachment on a note without changing its identity.
-- Existing files and all other immutable item fields keep their prior behavior.
create or replace function public.knowledge_item_stamp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  new.created_by:=auth.uid(); new.created_at:=now();
  if new.item_type='note' and new.file_path is not null and btrim(new.body)='' then new.item_type:='file'; end if;
  select nullif(btrim(p.full_name),'') into new.author_name from public.profiles p where p.id=new.created_by;
 else
  new.organization_id:=old.organization_id; new.created_by:=old.created_by;
  new.created_at:=old.created_at; new.author_name:=old.author_name; new.item_type:=old.item_type;
  if old.item_type='note' and new.file_path is null and old.file_path is not null then
   new.file_name:=null; new.file_size:=null;
  else
   new.file_path:=old.file_path; new.file_size:=old.file_size;
  end if;
 end if;
 if new.folder_id is not null and not exists (
  select 1 from public.knowledge_folders f where f.id=new.folder_id and f.organization_id=new.organization_id and f.created_by=new.created_by
 ) then raise exception 'INVALID_KNOWLEDGE_FOLDER'; end if;
 new.updated_at:=now(); return new;
end $$;

-- The bucket remains private. Existing single-attachment and orphan cleanup rules stay valid.
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
 select n.organization_id,n.created_by,n.shared_with_team,n.item_type into item
 from public.knowledge_attachments a join public.knowledge_items n on n.id=a.note_id
 where a.file_path=object_name;
 if found then
  return item.organization_id=public.current_organization_id()
   and (item.created_by=auth.uid() or item.shared_with_team)
   and item.item_type='note' and public.has_section_access('notes');
 end if;
 return (storage.foldername(object_name))[1]=public.current_organization_id()::text
   and (storage.foldername(object_name))[2]=auth.uid()::text
   and (public.has_section_access('notes') or public.has_section_access('files'))
   and (public.get_my_access()->>'role') in ('company_admin','operator','manager');
end $$;
revoke all on function public.knowledge_storage_readable(text) from public;
grant execute on function public.knowledge_storage_readable(text) to authenticated,service_role;

commit;
