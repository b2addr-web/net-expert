-- Apply after supabase-workspace-history.sql.
begin;

revoke all on function public.log_organization_event(text,uuid,jsonb) from public,anon,authenticated;
create or replace function public.log_organization_event(action_name text,target_id uuid default null,event_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_company_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if action_name not in ('member_invited','member_access_updated','member_removed','export_permissions_updated') then raise exception 'UNSUPPORTED_AUDIT_EVENT'; end if;
  insert into organization_audit_logs(organization_id,actor_id,action,target_user_id,details)
  values(current_organization_id(),auth.uid(),action_name,target_id,coalesce(event_details,'{}'::jsonb));
end $$;
grant execute on function public.log_organization_event(text,uuid,jsonb) to authenticated;

revoke all on function public.record_auth_event(text,jsonb) from public,anon,authenticated;
create or replace function public.record_auth_event(event_name text,event_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if event_name not in ('login_succeeded','signup_succeeded','password_changed','logout','logout_all_sessions') then raise exception 'UNSUPPORTED_AUTH_EVENT'; end if;
  insert into login_audit(user_id,session_id,event_name,details)
  values(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,event_name,coalesce(event_details,'{}'::jsonb));
end $$;
grant execute on function public.record_auth_event(text,jsonb) to authenticated;

-- Return suspended membership status so the client can show the correct message,
-- while all data policies continue to fail closed through current_organization_id().
create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
  'organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
  'permissions',(select jsonb_object_agg(s,case when m.status='active' then has_section_access(s) else false end)
    from unnest(array['sim','assets','purchasing','reports','exports','administration']) s)
)
from organization_members m join organizations o on o.id=m.organization_id
where m.user_id=auth.uid() order by m.joined_at limit 1
$$;
grant execute on function public.get_my_access() to authenticated;

create or replace function public.admin_remove_member(member_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=current_organization_id();
begin
  if not is_company_admin(org) then raise exception 'ADMIN_REQUIRED'; end if;
  if member_id=auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
  if not exists(select 1 from organization_members where organization_id=org and user_id=member_id) then raise exception 'MEMBER_NOT_FOUND'; end if;
  perform log_organization_event('member_removed',member_id,'{}'::jsonb);
  delete from organization_members where organization_id=org and user_id=member_id;
end $$;
revoke all on function public.admin_remove_member(uuid) from public,anon;
grant execute on function public.admin_remove_member(uuid) to authenticated;

commit;
