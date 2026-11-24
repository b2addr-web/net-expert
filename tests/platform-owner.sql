-- Exercise the real signup trigger and owner functions on Staging; roll back all fixtures.
begin;
do $$
declare
 v_owner uuid:=gen_random_uuid(); v_first uuid:=gen_random_uuid(); v_second uuid:=gen_random_uuid();
 v_first_company uuid; v_second_company uuid; v_user_count integer; v_base_grants integer;
 v_today date:=public.commerce_today(); v_summary jsonb; v_revenue numeric;
begin
 select count(*) into v_base_grants from public.commerce_accounts where offer_granted;
 select coalesce(sum(amount),0) into v_revenue from public.commerce_receipts where received_on<=v_today;
 insert into auth.users(id,email,raw_user_meta_data) values
  (v_owner,v_owner::text||'@owner-fixture.invalid','{"organization_name":"Staging owner fixture"}'),
  (v_first,v_first::text||'@owner-fixture.invalid','{"organization_name":"Staging first seat"}'),
  (v_second,v_second::text||'@owner-fixture.invalid','{"organization_name":"Staging no seat"}');
 insert into public.commerce_owners(user_id) values(v_owner);
 select id into strict v_first_company from public.organizations where created_by=v_first;
 select id into strict v_second_company from public.organizations where created_by=v_second;
 perform public.commerce_update(v_owner,'trial',jsonb_build_object('organizationId',(select id from public.organizations where created_by=v_owner),'endsOn',null));
 perform public.commerce_update(v_owner,'settings',jsonb_build_object(
  'freeLimit',v_base_grants+1,'freeDays',7,'monthlyPrice',125,'noticeDays',14));
 update auth.users set email_confirmed_at=now() where id=v_first;
 update auth.users set email_confirmed_at=now() where id=v_second;
 if not exists(select 1 from public.commerce_accounts where organization_id=v_first_company and plan='free' and ends_on=v_today+6 and offer_granted) then
  raise exception 'First company did not get a finite offer'; end if;
 if not exists(select 1 from public.commerce_accounts where organization_id=v_second_company and plan='unclassified' and not offer_granted) then
  raise exception 'Quota did not protect the second company'; end if;
 if (select count(*) from public.commerce_accounts where offer_granted)<>v_base_grants+1 then
  raise exception 'Internal trial consumed a seat'; end if;
 v_summary:=public.commerce_dashboard(v_owner);
 if (v_summary->'metrics'->>'seats_remaining')::integer<>0 or not (v_summary->'upcoming' @> jsonb_build_array(jsonb_build_object('id',v_first_company))) then
  raise exception 'Seat or expiry metrics incorrect'; end if;
 if not exists(select 1 from public.commerce_events where organization_id=v_first_company and action='registered') then
  raise exception 'Registration alert missing'; end if;
 perform public.commerce_update(v_owner,'extend',jsonb_build_object('organizationId',v_first_company,'endsOn',null));
 if exists(select 1 from public.commerce_accounts where organization_id=v_first_company and ends_on is not null) then
  raise exception 'Offer was not made permanent'; end if;
 perform public.commerce_update(v_owner,'paid',jsonb_build_object('organizationId',v_first_company,'endsOn',null));
 perform public.commerce_update(v_owner,'receipt',jsonb_build_object('organizationId',v_first_company,'reference','Fixture receipt','amount',80,'receivedOn',v_today));
 v_summary:=public.commerce_dashboard(v_owner);
 if (v_summary->'metrics'->>'actual_revenue')::numeric<>v_revenue+80
  or not exists(select 1 from public.commerce_accounts where organization_id=v_first_company and plan='paid' and monthly_price=125) then
  raise exception 'Actual collection and plan rate not recorded separately'; end if;
 begin
  perform public.commerce_dashboard(v_second);
  raise exception 'Company admin unexpectedly accessed owner data';
 exception when raise_exception then if sqlerrm<>'NOT_AUTHORIZED' then raise; end if; end;
 if has_table_privilege('authenticated','public.commerce_accounts','SELECT') or
  has_function_privilege('authenticated','public.commerce_dashboard(uuid,integer)','EXECUTE') then
  raise exception 'Owner objects exposed to workspace users'; end if;
end $$;
rollback;
select 'PASS: registration, quota, internal trial, expiry, extension, pricing, receipts and owner isolation' as test_result;
