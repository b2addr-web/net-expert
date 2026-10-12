create or replace function public.log_organization_event(
  action_name text, target_id uuid default null, event_details jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_company_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if action_name not in (
    'member_invited','member_added_existing','member_access_updated',
    'member_removed','export_permissions_updated'
  ) then raise exception 'UNSUPPORTED_AUDIT_EVENT'; end if;
  insert into public.organization_audit_logs(organization_id,actor_id,action,target_user_id,details)
  values(public.current_organization_id(),auth.uid(),action_name,target_id,coalesce(event_details,'{}'::jsonb));
end
$$;
