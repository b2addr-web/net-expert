-- Explicit Data API table/sequence privileges for the current NetExpert schema.
-- App roles (admin/manager/operator/viewer) are enforced by RLS, not separate PG roles.
-- Apply after all 20261102 migrations. This narrows both legacy and fresh installs.
begin;

do $netexpert$
declare
  table_name text;
  sequence_name text;
  table_names text[] := array[
    'activities','assets','audit_log','contracts','custody_events','devices',
    'expenses','export_history','intake_cases','intake_link_aliases',
    'intake_links','intake_notes','intake_rate_limits','inventory_items',
    'knowledge_attachments','knowledge_folders','knowledge_items','login_audit',
    'member_export_permissions','member_permissions','monitor_checks',
    'monitor_incidents','monitor_sites','organization_audit_logs',
    'organization_invitations','organization_members','organizations',
    'platform_job_runs','platform_notification_log','profiles','purchases',
    'scheduled_reports','service_subscriptions','user_presence',
    'user_workspace_preferences','users','workspace_choices','workspace_records',
    'workspace_versions'
  ];
begin
  foreach table_name in array table_names loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required NetExpert table missing: %', table_name;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid=to_regclass(format('public.%I', table_name))) then
      raise exception 'Refusing Data API grant without RLS: %', table_name;
    end if;
    -- REVOKE table privileges does not remove independent column grants.
    if exists (
      select 1 from pg_attribute a
      where a.attrelid=to_regclass(format('public.%I', table_name))
        and a.attnum>0 and a.attacl is not null
    ) then
      raise exception 'Review column-specific privileges before applying baseline: %', table_name;
    end if;
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
  end loop;

  -- No browser-direct anonymous table access is required: public intake uses
  -- server routes and narrowly scoped RPCs. Preserve service_role grants.
  execute 'grant select on table public.activities, public.custody_events, public.inventory_items,
    public.login_audit, public.monitor_checks, public.monitor_incidents, public.monitor_sites,
    public.organization_audit_logs, public.organizations, public.profiles,
    public.service_subscriptions, public.workspace_choices,
    public.workspace_versions to authenticated';
  execute 'grant select, insert on table public.audit_log, public.export_history to authenticated';
  execute 'grant select, update on table public.organization_members to authenticated';
  execute 'grant select, insert, delete on table public.knowledge_attachments to authenticated';
  execute 'grant select, insert, update, delete on table public.assets, public.contracts,
    public.devices, public.expenses, public.knowledge_folders, public.knowledge_items,
    public.member_export_permissions, public.member_permissions,
    public.organization_invitations, public.purchases, public.scheduled_reports,
    public.workspace_records to authenticated';
  grant all privileges on table public.workspace_versions to service_role;

  for sequence_name in
    select s.relname from pg_class s join pg_namespace n on n.oid=s.relnamespace
    where n.nspname='public' and s.relkind='S'
  loop
    execute format('revoke all privileges on sequence public.%I from public, anon, authenticated', sequence_name);
  end loop;
  grant usage, select on sequence public.assets_id_seq, public.audit_log_id_seq,
    public.contracts_id_seq, public.devices_id_seq, public.expenses_id_seq,
    public.export_history_id_seq, public.purchases_id_seq to authenticated;
end
$netexpert$;

-- This SECURITY INVOKER view is consumed by the server-side monitoring API.
-- A legacy install had an authenticated GRANT that the clean schema lacks.
revoke all privileges on table public.monitor_site_statistics from public, anon, authenticated;
grant select on table public.monitor_site_statistics to service_role;

-- PUBLIC can execute newly created PostgreSQL functions by default. Remove
-- browser-anonymous execution from this application's exposed public schema;
-- only the listed authenticated RPCs/RLS helpers are callable by users.
revoke all privileges on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function
  public.admin_add_existing_member(text,text,text),
  public.admin_remove_member(uuid),
  public.admin_update_member(uuid,text,text,text,jsonb),
  public.assign_available_custody(uuid,integer,text,text,text,text),
  public.bulk_edit_workspace(text,jsonb,jsonb),
  public.current_organization_id(),
  public.get_my_access(),
  public.get_my_export_permissions(),
  public.has_section_access(text),
  public.import_workspace_records(jsonb,text),
  public.is_admin(),
  public.is_company_admin(uuid),
  public.knowledge_storage_readable(text),
  public.list_available_custody(),
  public.list_custody_employees(),
  public.list_employee_custody(text),
  public.list_my_workspaces(),
  public.list_organization_members(),
  public.log_organization_event(text,uuid,jsonb),
  public.record_auth_event(text,jsonb),
  public.repair_my_account(),
  public.restore_workspace_version(uuid,integer,integer),
  public.return_employee_custody(text,jsonb),
  public.save_workspace_record(text,uuid,jsonb,integer),
  public.select_my_workspace(uuid),
  public.use_workspace_choice(text,text),
  public.workspace_write(text)
to authenticated;

-- Supabase's legacy default exposure varies by project age. Future objects
-- created by postgres must opt in; migrations created by other owners still
-- require an explicit grant review before deployment.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;


commit;
