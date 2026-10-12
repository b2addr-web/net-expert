begin;

create table if not exists public.user_workspace_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade
);
alter table public.user_workspace_preferences enable row level security;
revoke all on public.user_workspace_preferences from public, anon, authenticated;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select m.organization_id
  from public.organization_members m
  left join public.user_workspace_preferences p
    on p.user_id = auth.uid() and p.organization_id = m.organization_id
  where m.user_id = auth.uid() and m.status = 'active'
  order by (p.organization_id is not null) desc, m.joined_at, m.organization_id
  limit 1
$$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
    'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end)
      from unnest(array['sim','assets','purchasing','reports','exports','administration']) s)
  )
  from public.organization_members m join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid()
  order by (m.organization_id=public.current_organization_id()) desc, m.joined_at
  limit 1
$$;

create or replace function public.list_my_workspaces()
returns table(organization_id uuid, organization_name text, role text)
language sql stable security definer set search_path = public
as $$
  select m.organization_id, o.name, m.role
  from public.organization_members m join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid() and m.status='active'
  order by o.name, m.organization_id
$$;
revoke all on function public.list_my_workspaces() from public, anon;
grant execute on function public.list_my_workspaces() to authenticated;

create or replace function public.select_my_workspace(workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.organization_members
    where user_id=auth.uid() and organization_id=workspace_id and status='active'
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED';
  end if;
  insert into public.user_workspace_preferences(user_id,organization_id)
  values(auth.uid(),workspace_id)
  on conflict(user_id) do update set organization_id=excluded.organization_id;
  return public.get_my_access();
end
$$;
revoke all on function public.select_my_workspace(uuid) from public, anon;
grant execute on function public.select_my_workspace(uuid) to authenticated;

create or replace function public.admin_add_existing_member(
  invitee_email text, invitee_role text, invitee_department text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  workspace_id uuid := public.current_organization_id();
  target_id uuid;
  normalized_email text := lower(trim(invitee_email));
begin
  if not public.is_company_admin(workspace_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if length(normalized_email)>254 or invitee_role not in ('viewer','operator')
    or length(coalesce(invitee_department,''))>100 then raise exception 'INVALID_INPUT'; end if;
  if not exists (
    select 1 from public.organization_invitations
    where organization_id=workspace_id and lower(email)=normalized_email and status='pending'
  ) then raise exception 'INVITATION_REQUIRED'; end if;

  select id into target_id from auth.users
  where lower(email)=normalized_email and email_confirmed_at is not null limit 1;
  if target_id is null then raise exception 'ACCOUNT_NOT_CONFIRMED'; end if;
  if exists (
    select 1 from public.organization_members
    where organization_id=workspace_id and user_id=target_id
  ) then raise exception 'ALREADY_MEMBER'; end if;

  insert into public.organization_members(organization_id,user_id,role,status,department)
  values(workspace_id,target_id,invitee_role,'active',invitee_department);
  update public.organization_invitations set status='accepted'
  where organization_id=workspace_id and lower(email)=normalized_email and status='pending';
  perform public.log_organization_event('member_added_existing',target_id,
    jsonb_build_object('email',normalized_email,'role',invitee_role,'department',invitee_department));
  return jsonb_build_object('user_id',target_id);
end
$$;
revoke all on function public.admin_add_existing_member(text,text,text) from public, anon;
grant execute on function public.admin_add_existing_member(text,text,text) to authenticated;

commit;
