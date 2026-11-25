begin;

create table owner_portal_private.reserved_emails (
 email text primary key check (email=lower(trim(email)) and length(email) between 3 and 254)
);
alter table owner_portal_private.reserved_emails enable row level security;
revoke all on owner_portal_private.reserved_emails from public,anon,authenticated,service_role;

create function owner_portal_private.validate_owner_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 reserved boolean:=exists(select 1 from owner_portal_private.reserved_emails r where r.email=lower(new.email));
 marked boolean:=coalesce(new.raw_app_meta_data->>'netexpert_identity'='platform_owner',false);
begin
 if marked and not reserved then raise exception 'OWNER_EMAIL_NOT_RESERVED'; end if;
 if reserved and not marked then raise exception 'OWNER_EMAIL_RESERVED'; end if;
 if tg_op='UPDATE' then
  if marked is distinct from coalesce(old.raw_app_meta_data->>'netexpert_identity'='platform_owner',false) then
   raise exception 'OWNER_IDENTITY_IMMUTABLE';
  end if;
  if marked and lower(new.email) is distinct from lower(old.email) then raise exception 'OWNER_EMAIL_IMMUTABLE'; end if;
 end if;
 return new;
end $$;

create trigger owner_validate_identity before insert or update of email,raw_app_meta_data on auth.users
 for each row execute function owner_portal_private.validate_owner_identity();

create or replace trigger on_auth_user_created after insert on auth.users
 for each row when ((new.raw_app_meta_data->>'netexpert_identity') is distinct from 'platform_owner')
 execute function public.handle_new_auth_user();

do $$
begin
 if exists(select 1 from pg_catalog.pg_trigger where tgrelid='auth.users'::regclass
  and tgname='on_auth_user_invite_confirmed' and not tgisinternal) then
  create or replace trigger on_auth_user_invite_confirmed after update of email_confirmed_at on auth.users
   for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null
    and (new.raw_app_meta_data->>'netexpert_identity') is distinct from 'platform_owner')
   execute function public.handle_new_auth_user();
 end if;
end $$;

create function owner_portal_private.register_owner_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.commerce_owners(user_id) values(new.id);
 return new;
end $$;

create trigger owner_register_identity after insert on auth.users
 for each row when (new.raw_app_meta_data->>'netexpert_identity'='platform_owner')
 execute function owner_portal_private.register_owner_identity();

create function owner_portal_private.reject_owner_workspace()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 case tg_table_name
  when 'profiles' then actor:=new.id;
  when 'organization_members' then actor:=new.user_id;
  when 'organizations' then actor:=new.created_by;
 end case;
 if exists(select 1 from auth.users where id=actor and raw_app_meta_data->>'netexpert_identity'='platform_owner') then
  raise exception 'OWNER_WORKSPACE_NOT_ALLOWED';
 end if;
 return new;
end $$;

create trigger owner_isolated_profile before insert or update of id on public.profiles
 for each row execute function owner_portal_private.reject_owner_workspace();
create trigger owner_isolated_membership before insert or update of user_id on public.organization_members
 for each row execute function owner_portal_private.reject_owner_workspace();
create trigger owner_isolated_organization before insert or update of created_by on public.organizations
 for each row execute function owner_portal_private.reject_owner_workspace();

create function owner_portal_private.require_isolated_owner()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if not exists(select 1 from public.commerce_owners o join auth.users u on u.id=o.user_id
  join owner_portal_private.reserved_emails r on r.email=lower(u.email)
  where o.user_id=actor and u.email_confirmed_at is not null
  and u.raw_app_meta_data->>'netexpert_identity'='platform_owner')
  or exists(select 1 from public.organization_members where user_id=actor)
  or exists(select 1 from public.organizations where created_by=actor)
 then raise exception 'NOT_AUTHORIZED'; end if;
 return actor;
end $$;

create or replace function owner_portal_private.require_owner_mfa()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=owner_portal_private.require_isolated_owner();
begin
 if (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'MFA_REQUIRED'; end if;
 return actor;
end $$;

create function owner_portal_private.owner_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform owner_portal_private.require_isolated_owner();
 return jsonb_build_object('owner',true,'mfaRequired',(auth.jwt()->>'aal') is distinct from 'aal2');
end $$;

create function public.owner_portal_access()
returns jsonb language sql stable security invoker set search_path='' as $$
 select owner_portal_private.owner_access()
$$;

revoke all on function owner_portal_private.validate_owner_identity(),owner_portal_private.register_owner_identity(),
 owner_portal_private.reject_owner_workspace(),owner_portal_private.require_isolated_owner(),
 owner_portal_private.owner_access(),public.owner_portal_access() from public,anon,authenticated,service_role;
grant execute on function owner_portal_private.owner_access(),public.owner_portal_access() to authenticated;

commit;
