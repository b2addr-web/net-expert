-- Regression checks run in one transaction. No test records survive rollback.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from organization_members where role='company_admin' and status='active' order by joined_at limit 1),true);
set local role authenticated;
do $$ declare row1 public.workspace_records; rejected boolean:=false; begin
 if has_section_access('contracts') or has_section_access('operations') then raise exception 'Retired section still enabled'; end if;
 row1:=save_workspace_record('sim',null,'{"employee_id":"TEST-001","employee_name":"اختبار","department":"IT","assign_location":"Riyadh","mobile_number":"0550000000","sim_number":"TEST-ROLLBACK-SIM","provider":"STC","date_issued":"2026-09-16","status":"Active","attachments":[]}'::jsonb,null);
 if row1.data->>'mobile_number'<>'0550000000' then raise exception 'Leading zero lost'; end if;
 perform save_workspace_record('sim',row1.id,row1.data||'{"status":"Returned","date_returned":"2026-09-17"}'::jsonb,row1.version);
 begin perform save_workspace_record('sim',row1.id,row1.data,row1.version);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Stale update accepted';end if;
 perform use_workspace_choice('department','قسم الاختبار');
 if not exists(select 1 from workspace_choices where value='قسم الاختبار' and organization_id=current_organization_id()) then raise exception 'Choice was not saved';end if;
 perform save_workspace_record('assets',null,'{"employee_id":"TEST-001","employee_name":"Test","department":"IT","assign_location":"Riyadh","hardware":"Laptop","brand":"HP","serial_number":"TEST-ROLLBACK-SERIAL","status":"In Use","attachments":[]}'::jsonb,null);
 perform save_workspace_record('purchasing',null,'{"request_number":"TEST-ROLLBACK-PURCHASE","request_date":"2026-09-16","requested_by":"Test","department":"IT","hardware":"Laptop","brand":"HP","quantity":"2","estimated_cost":"2500","priority":"Medium","status":"Draft","attachments":[]}'::jsonb,null);
 if exists(select 1 from workspace_records where organization_id<>current_organization_id()) then raise exception 'Tenant data leak';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
 if exists(select 1 from workspace_records) then raise exception 'Nonmember can read records';end if;
 begin perform save_workspace_record('sim',null,'{}'::jsonb,null);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Nonmember can write records';end if;
end $$;
rollback;
select 'PASS: CRUD, optimistic locking, Arabic choices, module retirement, tenant isolation' as test_result;
