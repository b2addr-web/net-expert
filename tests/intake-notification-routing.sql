-- Run against the isolated staging database. All fixtures roll back.
begin;

do $$
declare
 org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid();
 manager_a uuid:=gen_random_uuid(); specialist uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 category uuid; case_a uuid; case_b uuid; device uuid; fallback uuid; skipped uuid; event uuid;
 token_a text:=gen_random_uuid()::text; token_b text:=gen_random_uuid()::text;
begin
 insert into auth.users(id,email) values
 (manager_a,manager_a||'@fixture.invalid'),(specialist,specialist||'@fixture.invalid'),(outsider,outsider||'@fixture.invalid');
 insert into organizations(id,name,slug) values(org_a,'Intake Fixture A',org_a::text),(org_b,'Intake Fixture B',org_b::text);
 insert into organization_members(organization_id,user_id,role,status) values
 (org_a,manager_a,'company_admin','active'),(org_a,specialist,'operator','active'),(org_b,outsider,'company_admin','active');
 insert into member_permissions(organization_id,user_id,section,allowed) values(org_a,specialist,'report',true);
 perform intake_save_routing(org_a,manager_a,'category',jsonb_build_object('name','الشبكات','active',true,'recipients',array[specialist,specialist,manager_a]));
 select id into category from intake_categories where organization_id=org_a;
 perform intake_save_routing(org_a,manager_a,'settings',jsonb_build_object('enabled',true,'email_enabled',true,'bell_enabled',true,'default_recipient',specialist,'recipients',array[manager_a]));
 insert into intake_links(organization_id,kind,label,token_hash,token_encrypted) values
 (org_a,'report','Fixture',token_a,'fixture'),(org_b,'report','Fixture',token_b,'fixture');

 select case_id into case_a from submit_intake_case(token_a,'fixture-ip',
  jsonb_build_object('employee_name','Fixture','employee_number','1','email','employee@fixture.invalid',
   'department','IT','description','Fixture only','issue_type',category));
 if (select count(*) from intake_notifications where case_id=case_a)<>2 then raise exception 'Category routing or dedupe failed'; end if;
 if exists(select 1 from intake_cases where id=case_a and (assignee_id is not null or issue_type<>'الشبكات')) then raise exception 'Assignment and notifications coupled'; end if;

 insert into intake_cases(organization_id,kind,reference,employee_name,employee_number,email,department,description,status)
 values(org_a,'device_request',gen_random_uuid()::text,'Fixture','2','employee@fixture.invalid','IT','Fixture','جديد') returning id into device;
 if (select array_agg(recipient_id) from intake_notifications where case_id=device)<>array[manager_a] then raise exception 'Device settings not independent'; end if;

 insert into intake_cases(organization_id,kind,reference,employee_name,employee_number,email,department,description,status)
 values(org_a,'report',gen_random_uuid()::text,'Fixture','3','employee@fixture.invalid','IT','Fixture','جديد') returning id into fallback;
 if (select array_agg(recipient_id) from intake_notifications where case_id=fallback)<>array[specialist] then raise exception 'Default fallback failed'; end if;

 select case_id into case_b from submit_intake_case(token_b,'fixture-ip',
  '{"employee_name":"Fixture","employee_number":"1","email":"employee@fixture.invalid","department":"IT","description":"Fixture","issue_type":"Printer"}');
 if (select array_agg(recipient_id) from intake_notifications where case_id=case_b)<>array[outsider] then raise exception 'Admin fallback or tenant isolation failed'; end if;
 begin
  perform intake_assign_case(org_a,manager_a,case_b,specialist,null);
  raise exception 'Cross-tenant case accepted';
 exception when raise_exception then if sqlerrm<>'NOT_FOUND' then raise; end if; end;
 begin
  perform intake_save_routing(org_a,manager_a,'category',jsonb_build_object('name','Printer','active',true,'recipients',array[outsider]));
  raise exception 'Cross-tenant recipient accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_RECIPIENT' then raise; end if; end;

 event:=intake_assign_case(org_a,manager_a,case_a,specialist,null);
 if event is null or intake_assign_case(org_a,manager_a,case_a,specialist,null) is not null then raise exception 'Assignment idempotency failed'; end if;
 event:=intake_assign_case(org_a,manager_a,case_a,manager_a,specialist);
 if (select recipient_id from intake_notifications where case_id=case_a and event_key=event::text)<>manager_a then raise exception 'Reassignment failed'; end if;
 if (select count(*) from intake_routing_audit where case_id=case_a and action='assigned')<>2 then raise exception 'Assignment history failed'; end if;

 perform intake_read_notifications(org_b,manager_a,null);
 if exists(select 1 from intake_notifications where case_id=case_b and read_at is not null) then raise exception 'Cross-tenant mark read'; end if;
 perform intake_read_notifications(org_a,manager_a,null);
 if exists(select 1 from intake_notifications where organization_id=org_a and recipient_id=manager_a and read_at is null) then raise exception 'Mark all failed'; end if;
 if (select count(*) from intake_claim_email(org_a,case_a))<>4 or exists(select 1 from intake_claim_email(org_a,case_a)) then raise exception 'Email claim dedupe failed'; end if;

 update member_permissions set allowed=false where organization_id=org_a and user_id=specialist and section='report';
 if exists(select 1 from intake_eligible(org_a,'report') where user_id=specialist) then raise exception 'Revoked member remained eligible'; end if;
 update organization_members set status='suspended' where organization_id=org_a and user_id=manager_a;
 insert into intake_cases(organization_id,kind,reference,employee_name,employee_number,email,department,description,status)
 values(org_a,'report',gen_random_uuid()::text,'Fixture','4','employee@fixture.invalid','IT','Fixture','جديد') returning id into skipped;
 if not exists(select 1 from intake_routing_audit where case_id=skipped and details->>'reason'='NO_ELIGIBLE_RECIPIENT') then raise exception 'Missing no-recipient reason'; end if;
 if exists(select 1 from intake_notifications where case_id=skipped) then raise exception 'Inactive member received notification'; end if;
 if has_table_privilege('authenticated','public.intake_notifications','SELECT') or
  has_function_privilege('anon','public.intake_assign_case(uuid,uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'Excessive grants'; end if;
end $$;

rollback;
select 'PASS: routing, fallback, device separation, assignment, queue, inbox and tenant/role isolation' as test_result;
