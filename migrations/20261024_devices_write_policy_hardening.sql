-- NetExpert Phase 4C: align device writes with the server-side write permission.
-- Review and apply only in a controlled staging migration.
begin;

drop policy if exists tenant_devices_write on public.devices;
create policy tenant_devices_write on public.devices
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.workspace_write('assets')
  );

drop policy if exists tenant_devices_update on public.devices;
create policy tenant_devices_update on public.devices
  for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.workspace_write('assets')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.workspace_write('assets')
  );

commit;
