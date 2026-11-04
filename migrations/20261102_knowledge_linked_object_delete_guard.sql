-- Prevent direct Storage deletion while a knowledge record still references the object.
-- The existing UI deletes the knowledge row first, then removes the orphaned object.
begin;

alter policy knowledge_file_cleanup on storage.objects
 using (
  bucket_id='knowledge-files'
  and (storage.foldername(name))[1]=public.current_organization_id()::text
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and (public.workspace_write('notes') or public.workspace_write('files'))
  and (public.get_my_access()->>'role') in ('company_admin','operator','manager')
  and not exists (select 1 from public.knowledge_items item where item.file_path=name)
  and not exists (select 1 from public.knowledge_attachments attachment where attachment.file_path=name)
 );

commit;
