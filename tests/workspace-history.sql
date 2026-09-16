-- Run after supabase-workspace-history.sql. All fixtures are rolled back.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from organization_members where role='company_admin' and status='active' order by joined_at limit 1),true);
set local role authenticated;
do $$ declare a workspace_records;b workspace_records;c workspace_records;rejected boolean;begin
 a:=save_workspace_record('sim',null,'{"employee_id":"TEST","employee_name":"Test","department":"IT","assign_location":"Riyadh","mobile_number":"0550000000","sim_number":"HISTORY-TEST","provider":"STC","date_issued":"2026-09-16","status":"Active","attachments":[]}',null);
 b:=save_workspace_record('sim',a.id,a.data||'{"status":"Returned"}',a.version);
 if a.id<>b.id or b.version<>2 or b.updated_by<>auth.uid() or b.created_by<>auth.uid() then raise exception 'Edit/metadata failure';end if;
 if not exists(select 1 from workspace_versions where record_id=a.id and version=2 and changes->'status'->>'old'='Active' and changes->'status'->>'new'='Returned' and actor_id=auth.uid()) then raise exception 'Audit diff failure';end if;
 c:=restore_workspace_version(a.id,1,b.version);
 if c.version<>3 or c.data->>'status'<>'Active' then raise exception 'Restore failure';end if;
 perform bulk_edit_workspace('sim',jsonb_build_array(jsonb_build_object('id',c.id,'version',c.version)),'{"department":"Finance","provider":"Zain"}');
 if not exists(select 1 from workspace_records where id=a.id and version=4 and data->>'provider'='Zain') then raise exception 'Quick edit failure';end if;
 rejected:=false;
 begin perform bulk_edit_workspace('sim',jsonb_build_array(jsonb_build_object('id',c.id,'version',3)),'{"department":"HR"}');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Stale batch accepted';end if;
 rejected:=false;
 begin update workspace_versions set actor_name='tampered' where record_id=a.id;exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Audit mutable';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare rejected boolean:=false;begin
 if exists(select 1 from workspace_versions) then raise exception 'History tenant leak';end if;
 begin perform bulk_edit_workspace('sim','[]','{"status":"Active"}');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Nonmember write accepted';end if;
end $$;
rollback;
select 'PASS: edit identity, metadata, field audit, restore, quick edit, stale conflict, audit immutability, tenant isolation' as result;

