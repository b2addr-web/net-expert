-- NetExpert Phase 4D: require an explicit write permission for every
-- authenticated write policy reviewed in the finance, export, and knowledge
-- modules. Apply in staging first; do not run against production directly.
begin;

-- Identity columns need sequence usage in addition to table GRANTs. RLS still
-- controls which rows can be inserted or changed.
grant usage,select on sequence public.assets_id_seq,public.purchases_id_seq,public.expenses_id_seq to authenticated;

alter policy tenant_purchases on public.purchases
  using (organization_id=public.current_organization_id() and public.workspace_write('procurement'))
  with check (organization_id=public.current_organization_id() and public.workspace_write('procurement'));
alter policy tenant_expenses on public.expenses
  using (organization_id=public.current_organization_id() and public.workspace_write('reports'))
  with check (organization_id=public.current_organization_id() and public.workspace_write('reports'));
alter policy tenant_financial_assets on public.assets
  using (organization_id=public.current_organization_id() and public.workspace_write('assets'))
  with check (organization_id=public.current_organization_id() and public.workspace_write('assets'));
alter policy tenant_contracts on public.contracts
  using (organization_id=public.current_organization_id() and public.workspace_write('contracts'))
  with check (organization_id=public.current_organization_id() and public.workspace_write('contracts'));
alter policy tenant_export_history_insert on public.export_history
  with check (organization_id=public.current_organization_id() and exported_by=auth.uid() and public.workspace_write('exports'));

alter policy knowledge_insert on public.knowledge_items
  with check (organization_id=public.current_organization_id() and created_by=auth.uid()
    and (case when item_type='file' then public.workspace_write('files') else public.workspace_write('notes') end));
alter policy knowledge_update on public.knowledge_items
  using (organization_id=public.current_organization_id() and created_by=auth.uid()
    and (case when item_type='file' then public.workspace_write('files') else public.workspace_write('notes') end))
  with check (organization_id=public.current_organization_id() and created_by=auth.uid()
    and (case when item_type='file' then public.workspace_write('files') else public.workspace_write('notes') end));
alter policy knowledge_delete on public.knowledge_items
  using (organization_id=public.current_organization_id() and created_by=auth.uid()
    and (case when item_type='file' then public.workspace_write('files') else public.workspace_write('notes') end));

alter policy knowledge_file_upload on storage.objects
  with check (bucket_id='knowledge-files'
    and (storage.foldername(name))[1]=public.current_organization_id()::text
    and (storage.foldername(name))[2]=auth.uid()::text
    and (public.workspace_write('notes') or public.workspace_write('files')));
alter policy knowledge_file_cleanup on storage.objects
  using (bucket_id='knowledge-files'
    and (storage.foldername(name))[1]=public.current_organization_id()::text
    and (storage.foldername(name))[2]=auth.uid()::text
    and (public.workspace_write('notes') or public.workspace_write('files')));

commit;
