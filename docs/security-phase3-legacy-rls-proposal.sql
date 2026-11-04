-- REVIEW ONLY. Do not apply to production without an isolated two-tenant test.
-- The legacy public.devices policies in supabase-multitenant.sql use read access
-- for INSERT and UPDATE. This proposal aligns writes with workspace_write('assets')
-- while retaining the current tenant and administrator-only DELETE checks.
begin;

drop policy if exists tenant_devices_write on public.devices;
create policy tenant_devices_write on public.devices for insert to authenticated
 with check (organization_id=public.current_organization_id() and public.workspace_write('assets'));

drop policy if exists tenant_devices_update on public.devices;
create policy tenant_devices_update on public.devices for update to authenticated
 using (organization_id=public.current_organization_id() and public.workspace_write('assets'))
 with check (organization_id=public.current_organization_id() and public.workspace_write('assets'));

commit;
