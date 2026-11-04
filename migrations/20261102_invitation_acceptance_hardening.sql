-- Defer membership until the invited email is confirmed. A revoked/expired
-- invitation must never become a company membership through Auth or repair.
begin;

alter table public.organization_invitations
  add column if not exists expires_at timestamptz default (now() + interval '7 days');

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public, auth as $$
declare
  org_id uuid;
  invited_role text;
  invited_department text;
  org_name text;
begin
  if TG_OP='INSERT' then
    insert into public.profiles(id,email,full_name,role,status)
    values(new.id,new.email,nullif(new.raw_user_meta_data->>'full_name',''),'viewer','active')
    on conflict(id) do update set email=excluded.email,
      full_name=coalesce(public.profiles.full_name,excluded.full_name),updated_at=now();
  elsif old.email_confirmed_at is not distinct from new.email_confirmed_at
    or new.email_confirmed_at is null then
    return new;
  end if;

  select organization_id,role,department into org_id,invited_role,invited_department
  from public.organization_invitations
  where lower(email)=lower(new.email) and status='pending'
    and (expires_at is null or expires_at>now())
  order by created_at desc limit 1;

  if org_id is not null then
    if new.email_confirmed_at is null then return new; end if;
    insert into public.organization_members(organization_id,user_id,role,status,department)
    values(org_id,new.id,invited_role,'active',invited_department)
    on conflict(organization_id,user_id) do nothing;
    update public.organization_invitations set status='accepted'
    where organization_id=org_id and lower(email)=lower(new.email)
      and status='pending' and (expires_at is null or expires_at>now());
  elsif TG_OP='INSERT' then
    -- Preserve the existing self-signup flow when no valid invitation exists.
    org_name := coalesce(nullif(new.raw_user_meta_data->>'organization_name',''),split_part(new.email,'@',2));
    insert into public.organizations(name,slug,created_by)
    values(org_name,lower(regexp_replace(org_name,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(new.id::text,1,8),new.id)
    returning id into org_id;
    insert into public.organization_members(organization_id,user_id,role,status,department)
    values(org_id,new.id,'company_admin','active',null)
    on conflict(organization_id,user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();
drop trigger if exists on_auth_user_invite_confirmed on auth.users;
create trigger on_auth_user_invite_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_new_auth_user();

create or replace function public.repair_my_account()
returns jsonb language plpgsql security definer set search_path=public, auth as $$
declare
  account_id uuid := auth.uid();
  account_email text;
  account_name text;
  workspace_id uuid;
  invited_role text;
  invited_department text;
  workspace_name text;
begin
  if account_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select email,nullif(raw_user_meta_data->>'full_name','') into account_email,account_name
  from auth.users where id=account_id;
  if account_email is null then raise exception 'Authenticated account was not found' using errcode='P0002'; end if;
  insert into public.profiles(id,email,full_name,role,status)
  values(account_id,account_email,account_name,'viewer','active') on conflict(id) do nothing;
  select organization_id into workspace_id from public.organization_members
  where user_id=account_id order by joined_at limit 1;
  if workspace_id is null then
    select organization_id,role,department into workspace_id,invited_role,invited_department
    from public.organization_invitations
    where lower(email)=lower(account_email) and status='pending'
      and (expires_at is null or expires_at>now())
    order by created_at desc limit 1;
    if workspace_id is null then
      workspace_name := coalesce(nullif((select raw_user_meta_data->>'organization_name' from auth.users where id=account_id),''),split_part(account_email,'@',2));
      insert into public.organizations(name,slug,created_by)
      values(workspace_name,lower(regexp_replace(workspace_name,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(account_id::text,1,8),account_id)
      returning id into workspace_id;
      invited_role := 'company_admin';
    else
      if not exists(select 1 from auth.users where id=account_id and email_confirmed_at is not null) then
        raise exception 'INVITATION_NOT_CONFIRMED';
      end if;
      update public.organization_invitations set status='accepted'
      where organization_id=workspace_id and lower(email)=lower(account_email)
        and status='pending' and (expires_at is null or expires_at>now());
    end if;
    insert into public.organization_members(organization_id,user_id,role,status,department)
    values(workspace_id,account_id,coalesce(invited_role,'viewer'),'active',invited_department)
    on conflict(organization_id,user_id) do nothing;
  end if;
  return public.get_my_access();
end $$;

commit;
