-- Restore read-only access to shared notes/files in existing installations.
-- A previous migration restricted SELECT to writers while INSERT/UPDATE/DELETE
-- already enforce workspace_write and ownership independently.
begin;
alter policy knowledge_read on public.knowledge_items
 using (organization_id=public.current_organization_id()
  and (case when item_type='file' then public.has_section_access('files') else public.has_section_access('notes') end)
  and (created_by=(select auth.uid()) or shared_with_team));
commit;
