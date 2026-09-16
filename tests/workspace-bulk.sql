begin;
select set_config('request.jwt.claim.sub',(select user_id::text from organization_members where role='company_admin' and status='active' order by joined_at limit 1),true);
set local role authenticated;
do $$ declare m text;d jsonb;a workspace_records;b workspace_records;v workspace_records;batch jsonb;rejected boolean;begin
foreach m in array array['sim','assets','purchasing'] loop
 d:='{"employee_id":"TEST","employee_name":"Test","department":"IT","assign_location":"Riyadh","mobile_number":"0550000000","sim_number":"BULK-SIM","provider":"STC","date_issued":"2026-09-16","status":"Active","attachments":[],"hardware":"Laptop","brand":"HP","serial_number":"BULK-SERIAL","request_number":"BULK-REQUEST","request_date":"2026-09-16","requested_by":"Test","quantity":"1","priority":"Medium"}';
 a:=save_workspace_record(m,null,d,null);
 b:=save_workspace_record(m,null,d||'{"sim_number":"BULK-SIM-2","serial_number":"BULK-SERIAL-2","request_number":"BULK-REQUEST-2"}',null);
 batch:=jsonb_build_array(jsonb_build_object('id',a.id,'version',1),jsonb_build_object('id',b.id,'version',1));
 perform bulk_edit_workspace(m,batch,'{"department":"Finance"}');
 if (select count(*) from workspace_records where id in (a.id,b.id) and version=2 and data->>'department'='Finance')<>2 then raise exception 'Bulk update failure %',m;end if;
 batch:=jsonb_build_array(jsonb_build_object('id',a.id,'version',2),jsonb_build_object('id',b.id,'version',1));
 rejected:=false;begin perform bulk_edit_workspace(m,batch,'{"department":"HR"}');exception when others then rejected:=true;end;
 if not rejected or exists(select 1 from workspace_records where id in(a.id,b.id) and data->>'department'='HR') then raise exception 'Atomic rollback failed %',m;end if;
 v:=restore_workspace_version(a.id,1,2);
 if v.version<>3 or v.data->>'department'<>'IT' then raise exception 'Restore failure %',m;end if;
end loop;
if has_table_privilege('authenticated','workspace_versions','TRUNCATE') then raise exception 'History truncation allowed';end if;
end $$;
rollback;
select 'PASS: all modules, multi-record edit, atomic rollback, restore, immutable history' as result;

