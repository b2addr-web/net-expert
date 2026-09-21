-- Additive authentication repair for Net Expert.
-- Creates only missing account rows; existing profiles, memberships and roles remain unchanged.
begin;

create or replace function public.repair_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  account_id uuid := auth.uid();
  account_email text;
  account_name text;
  workspace_id uuid;
  invited_role text;
  invited_department text;
  workspace_name text;
begin
  if account_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select email, nullif(raw_user_meta_data->>'full_name', '')
    into account_email, account_name
  from auth.users
  where id = account_id;

  if account_email is null then
    raise exception 'Authenticated account was not found' using errcode = 'P0002';
  end if;

  insert into public.profiles(id, email, full_name, role, status)
  values(account_id, account_email, account_name, 'viewer', 'active')
  on conflict (id) do nothing;

  select organization_id into workspace_id
  from public.organization_members
  where user_id = account_id
  order by joined_at
  limit 1;

  if workspace_id is null then
    select organization_id, role, department
      into workspace_id, invited_role, invited_department
    from public.organization_invitations
    where lower(email) = lower(account_email) and status = 'pending'
    order by created_at desc
    limit 1;

    if workspace_id is null then
      workspace_name := coalesce(nullif((select raw_user_meta_data->>'organization_name' from auth.users where id=account_id), ''), split_part(account_email, '@', 2));
      insert into public.organizations(name, slug, created_by)
      values(workspace_name, lower(regexp_replace(workspace_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(account_id::text, 1, 8), account_id)
      returning id into workspace_id;
      invited_role := 'company_admin';
    else
      update public.organization_invitations
      set status = 'accepted'
      where organization_id = workspace_id and lower(email) = lower(account_email) and status = 'pending';
    end if;

    insert into public.organization_members(organization_id, user_id, role, status, department)
    values(workspace_id, account_id, coalesce(invited_role, 'viewer'), 'active', invited_department)
    on conflict (organization_id, user_id) do nothing;
  end if;

  return public.get_my_access();
end;
$$;

revoke all on function public.repair_my_account() from public, anon;
grant execute on function public.repair_my_account() to authenticated;

commit;
