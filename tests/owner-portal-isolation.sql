-- Run against the Staging database with the owner identity migration installed.
begin;
do $$
declare
 company_user uuid:=gen_random_uuid(); owner_user uuid:=gen_random_uuid(); company_id uuid;
 company_email text:=company_user::text||'@owner-isolation.invalid';
 owner_email text:=company_user::text||'+netexpert-owner@owner-isolation.invalid';
 owner_marker jsonb:='{"netexpert_identity":"platform_owner"}';
begin
 insert into owner_portal_private.reserved_emails values(owner_email);
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
 values(company_user,company_email,owner_marker,now());
 select organization_id into strict company_id from public.organization_members where user_id=company_user;
 if exists(select 1 from public.commerce_owners where user_id=company_user) then
  raise exception 'Editable metadata granted owner role'; end if;

 begin
  insert into auth.users(id,email,raw_user_meta_data) values(gen_random_uuid(),owner_email,owner_marker);
  raise exception 'Reserved address was available to a company signup';
 exception when raise_exception then if sqlerrm<>'OWNER_EMAIL_RESERVED' then raise; end if; end;

 insert into auth.users(id,email,raw_app_meta_data) values(owner_user,owner_email,owner_marker);
 update auth.users set email_confirmed_at=now() where id=owner_user;
 if not exists(select 1 from public.commerce_owners where user_id=owner_user)
  or exists(select 1 from public.profiles where id=owner_user)
  or exists(select 1 from public.organization_members where user_id=owner_user)
  or exists(select 1 from public.organizations where created_by=owner_user)
 then raise exception 'Owner was not provisioned independently'; end if;

 insert into owner_portal_private.reserved_emails values(company_email);
 begin
  update auth.users set raw_app_meta_data=owner_marker where id=company_user;
  raise exception 'Existing company user was converted into an owner';
 exception when raise_exception then if sqlerrm<>'OWNER_IDENTITY_IMMUTABLE' then raise; end if; end;

 begin
  insert into public.organization_members(organization_id,user_id,role,status)
   values(company_id,owner_user,'company_admin','active');
  raise exception 'Owner joined an organization';
 exception when raise_exception then if sqlerrm<>'OWNER_WORKSPACE_NOT_ALLOWED' then raise; end if; end;

 if has_function_privilege('anon','public.owner_portal_access()','EXECUTE')
  or has_function_privilege('authenticated','public.commerce_dashboard(uuid,integer)','EXECUTE')
  or has_table_privilege('authenticated','public.commerce_owners','INSERT') then
  raise exception 'Unexpected direct database privileges'; end if;

 perform set_config('request.jwt.claim.sub',company_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',company_user,'role','authenticated','aal','aal2')::text,true);
 execute 'set local role authenticated';
 begin
  perform public.owner_portal_access();
  raise exception 'Company account gained owner portal access';
 exception when raise_exception then if sqlerrm<>'NOT_AUTHORIZED' then raise; end if; end;
 begin
  perform public.owner_portal_dashboard(0);
  raise exception 'Company account gained owner dashboard access';
 exception when raise_exception then if sqlerrm<>'NOT_AUTHORIZED' then raise; end if; end;

 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user,'role','authenticated','aal','aal1')::text,true);
 if public.owner_portal_access() <> '{"owner":true,"mfaRequired":true}'::jsonb then
  raise exception 'Owner AAL1 access state is incorrect'; end if;
 begin
  perform public.owner_portal_dashboard(0);
  raise exception 'Owner dashboard permitted without MFA';
 exception when raise_exception then if sqlerrm<>'MFA_REQUIRED' then raise; end if; end;
 begin
  perform public.owner_portal_update('settings','{}');
  raise exception 'Owner settings permitted without MFA';
 exception when raise_exception then if sqlerrm<>'MFA_REQUIRED' then raise; end if; end;
 begin
  perform public.repair_my_account();
  raise exception 'Workspace repair accepted the owner identity';
 exception when raise_exception then if sqlerrm<>'OWNER_WORKSPACE_NOT_ALLOWED' then raise; end if; end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_user,'role','authenticated','aal','aal2')::text,true);
 if public.owner_portal_access() <> '{"owner":true,"mfaRequired":false}'::jsonb
  or public.owner_portal_dashboard(0)->'metrics' is null then raise exception 'Owner AAL2 was denied'; end if;
 execute 'reset role';
 if not exists(select 1 from public.organization_members where organization_id=company_id and user_id=company_user)
  or exists(select 1 from public.organization_members where user_id=owner_user) then
  raise exception 'Existing company member or owner isolation was changed'; end if;
end $$;
rollback;
select 'PASS: reserved email, independent account, company isolation and MFA' as result;
