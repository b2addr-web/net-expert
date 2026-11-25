begin;

-- Keep the original commercial implementation private to its database owner.
-- All application access goes through the JWT-bound functions below.
revoke execute on function public.commerce_dashboard(uuid,integer),
 public.commerce_update(uuid,text,jsonb) from public,anon,authenticated,service_role;

create schema owner_portal_private;
revoke all on schema owner_portal_private from public,anon,authenticated,service_role;
grant usage on schema owner_portal_private to authenticated;

create function owner_portal_private.require_owner_mfa()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.commerce_owners where user_id=actor) then
  raise exception 'NOT_AUTHORIZED';
 end if;
 if (auth.jwt()->>'aal') is distinct from 'aal2' then
  raise exception 'MFA_REQUIRED';
 end if;
 return actor;
end $$;

create function owner_portal_private.dashboard(p_page integer)
returns jsonb language sql stable security definer set search_path='' as $$
 select public.commerce_dashboard(owner_portal_private.require_owner_mfa(),least(greatest(coalesce(p_page,0),0),100000))
$$;

create function owner_portal_private.update_commerce(p_action text,p_data jsonb)
returns void language sql security definer set search_path='' as $$
 select public.commerce_update(owner_portal_private.require_owner_mfa(),p_action,p_data)
$$;

create function public.owner_portal_dashboard(p_page integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select owner_portal_private.dashboard(p_page)
$$;

create function public.owner_portal_update(p_action text,p_data jsonb)
returns void language sql security invoker set search_path='' as $$
 select owner_portal_private.update_commerce(p_action,p_data)
$$;

revoke execute on function owner_portal_private.require_owner_mfa(),
 owner_portal_private.dashboard(integer),owner_portal_private.update_commerce(text,jsonb),
 public.owner_portal_dashboard(integer),public.owner_portal_update(text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function owner_portal_private.dashboard(integer),owner_portal_private.update_commerce(text,jsonb),
 public.owner_portal_dashboard(integer),public.owner_portal_update(text,jsonb) to authenticated;

commit;
