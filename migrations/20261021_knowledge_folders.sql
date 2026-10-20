-- Optional, additive knowledge folders. Review and apply to a non-production environment before production.
-- The two page routes work with the existing knowledge_items RLS even before this migration.
begin;

create table if not exists public.knowledge_folders (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 name text not null check (char_length(btrim(name)) between 1 and 90),
 shared_with_team boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,organization_id,created_by)
);

create unique index if not exists knowledge_folders_owner_name_unique
 on public.knowledge_folders(organization_id,created_by,lower(name));
create index if not exists knowledge_folders_org_name
 on public.knowledge_folders(organization_id,name);

alter table public.knowledge_folders enable row level security;
grant select,insert,update,delete on public.knowledge_folders to authenticated;

create policy knowledge_folders_read on public.knowledge_folders for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('notes')
 and (created_by=(select auth.uid()) or shared_with_team));

create policy knowledge_folders_insert on public.knowledge_folders for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid())
 and public.has_section_access('notes') and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

create policy knowledge_folders_update on public.knowledge_folders for update to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid())
 and public.has_section_access('notes') and (public.get_my_access()->>'role') in ('company_admin','operator','manager'))
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid())
 and public.has_section_access('notes') and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

create policy knowledge_folders_delete on public.knowledge_folders for delete to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid())
 and public.has_section_access('notes') and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

alter table public.knowledge_items add column if not exists folder_id uuid;

alter table public.knowledge_items
 add constraint knowledge_items_folder_same_owner
 foreign key (folder_id,organization_id,created_by)
 references public.knowledge_folders(id,organization_id,created_by)
 on delete set null (folder_id);

create index if not exists knowledge_items_folder_id_index
 on public.knowledge_items(organization_id,folder_id)
 where folder_id is not null;

commit;
