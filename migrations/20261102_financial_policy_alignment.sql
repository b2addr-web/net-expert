-- Align legacy financial tables with the final section names and read/write roles.
-- Apply after 20261024_full_write_policy_hardening.sql and contracts permission migration.
begin;

drop policy if exists tenant_purchases on public.purchases;
drop policy if exists tenant_purchases_read on public.purchases;
drop policy if exists tenant_purchases_insert on public.purchases;
drop policy if exists tenant_purchases_update on public.purchases;
drop policy if exists tenant_purchases_delete on public.purchases;
create policy tenant_purchases_read on public.purchases for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('purchasing'));
create policy tenant_purchases_insert on public.purchases for insert to authenticated
 with check (organization_id=public.current_organization_id() and public.workspace_write('purchasing'));
create policy tenant_purchases_update on public.purchases for update to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('purchasing'))
 with check (organization_id=public.current_organization_id() and public.workspace_write('purchasing'));
create policy tenant_purchases_delete on public.purchases for delete to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('purchasing'));

drop policy if exists tenant_expenses on public.expenses;
drop policy if exists tenant_expenses_read on public.expenses;
drop policy if exists tenant_expenses_insert on public.expenses;
drop policy if exists tenant_expenses_update on public.expenses;
drop policy if exists tenant_expenses_delete on public.expenses;
create policy tenant_expenses_read on public.expenses for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('reports'));
create policy tenant_expenses_insert on public.expenses for insert to authenticated
 with check (organization_id=public.current_organization_id() and public.workspace_write('reports'));
create policy tenant_expenses_update on public.expenses for update to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('reports'))
 with check (organization_id=public.current_organization_id() and public.workspace_write('reports'));
create policy tenant_expenses_delete on public.expenses for delete to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('reports'));

drop policy if exists tenant_financial_assets on public.assets;
drop policy if exists tenant_financial_assets_read on public.assets;
drop policy if exists tenant_financial_assets_insert on public.assets;
drop policy if exists tenant_financial_assets_update on public.assets;
drop policy if exists tenant_financial_assets_delete on public.assets;
create policy tenant_financial_assets_read on public.assets for select to authenticated
 using (organization_id=public.current_organization_id() and public.has_section_access('assets'));
create policy tenant_financial_assets_insert on public.assets for insert to authenticated
 with check (organization_id=public.current_organization_id() and public.workspace_write('assets'));
create policy tenant_financial_assets_update on public.assets for update to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('assets'))
 with check (organization_id=public.current_organization_id() and public.workspace_write('assets'));
create policy tenant_financial_assets_delete on public.assets for delete to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('assets'));

commit;
