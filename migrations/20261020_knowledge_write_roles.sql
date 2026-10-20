-- Match the workspace's existing viewer/read-only role model.
begin;

drop policy knowledge_insert on public.knowledge_items;
create policy knowledge_insert on public.knowledge_items for insert to authenticated
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager')
 and (file_path is null or file_path like organization_id::text||'/'||created_by::text||'/%'));

drop policy knowledge_update on public.knowledge_items;
create policy knowledge_update on public.knowledge_items for update to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'))
 with check (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager')
 and (file_path is null or file_path like organization_id::text||'/'||created_by::text||'/%'));

drop policy knowledge_delete on public.knowledge_items;
create policy knowledge_delete on public.knowledge_items for delete to authenticated
 using (organization_id=public.current_organization_id() and created_by=(select auth.uid()) and public.has_section_access('notes')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

drop policy knowledge_file_upload on storage.objects;
create policy knowledge_file_upload on storage.objects for insert to authenticated
 with check (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and (storage.foldername(name))[2]=(select auth.uid())::text and public.has_section_access('notes')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

drop policy knowledge_file_cleanup on storage.objects;
create policy knowledge_file_cleanup on storage.objects for delete to authenticated
 using (bucket_id='knowledge-files' and (storage.foldername(name))[1]=public.current_organization_id()::text
 and (storage.foldername(name))[2]=(select auth.uid())::text and public.has_section_access('notes')
 and (public.get_my_access()->>'role') in ('company_admin','operator','manager'));

commit;
