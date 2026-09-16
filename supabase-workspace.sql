-- Apply after existing tenant migrations. Transactional; preserves legacy records.
begin;
alter table public.member_permissions drop constraint if exists member_permissions_section_check;
insert into public.member_permissions(organization_id,user_id,section,allowed)
 select organization_id,user_id,'sim',allowed from public.member_permissions where section='assets' on conflict do nothing;
insert into public.member_permissions(organization_id,user_id,section,allowed)
 select organization_id,user_id,'purchasing',allowed from public.member_permissions where section='procurement' on conflict do nothing;
insert into public.member_permissions(organization_id,user_id,section,allowed)
 select organization_id,user_id,'exports',allowed from public.member_permissions where section='reports' on conflict do nothing;
delete from public.member_permissions where section not in ('sim','assets','purchasing','reports','exports','administration');
alter table public.member_permissions add constraint member_permissions_section_check check(section in ('sim','assets','purchasing','reports','exports','administration'));
create or replace function public.has_section_access(section_name text) returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','exports','administration') and exists(
 select 1 from organization_members m where m.organization_id=current_organization_id() and m.user_id=auth.uid() and m.status='active' and
 (m.role='company_admin' or (section_name<>'administration' and coalesce((select allowed from member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),case when m.role='manager' then true when m.role='operator' then section_name in ('sim','assets','purchasing') else section_name in ('sim','assets','reports') end))))
 $$;
create or replace function public.get_my_access() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,'permissions',(select jsonb_object_agg(s,has_section_access(s)) from unnest(array['sim','assets','purchasing','reports','exports','administration']) s)) from organization_members m join organizations o on o.id=m.organization_id where m.user_id=auth.uid() and m.status='active' order by m.joined_at limit 1
 $$;
create or replace function public.workspace_write(p_module text) returns boolean language sql stable security definer set search_path=public as $$
 select has_section_access(p_module) and exists(select 1 from organization_members where organization_id=current_organization_id() and user_id=auth.uid() and status='active' and role in ('company_admin','manager','operator'))
 $$;
create table if not exists public.workspace_records(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null default current_organization_id() references organizations(id),
 module text not null check(module in ('sim','assets','purchasing')),data jsonb not null default '{}',version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid default auth.uid(),legacy_key text,
 unique(organization_id,module,legacy_key),check(jsonb_typeof(data)='object')
);
create unique index if not exists workspace_sim_unique on workspace_records(organization_id,lower(data->>'sim_number')) where module='sim';
create unique index if not exists workspace_serial_unique on workspace_records(organization_id,lower(data->>'serial_number')) where module='assets';
create unique index if not exists workspace_request_unique on workspace_records(organization_id,lower(data->>'request_number')) where module='purchasing';
create index if not exists workspace_tenant_module on workspace_records(organization_id,module,id);
alter table workspace_records enable row level security;
drop policy if exists workspace_read on workspace_records;
create policy workspace_read on workspace_records for select to authenticated using(organization_id=current_organization_id() and has_section_access(module));
drop policy if exists workspace_insert on workspace_records;
create policy workspace_insert on workspace_records for insert to authenticated with check(organization_id=current_organization_id() and workspace_write(module));
drop policy if exists workspace_update on workspace_records;
create policy workspace_update on workspace_records for update to authenticated using(organization_id=current_organization_id() and workspace_write(module)) with check(organization_id=current_organization_id() and workspace_write(module));
drop policy if exists workspace_delete on workspace_records;
create policy workspace_delete on workspace_records for delete to authenticated using(organization_id=current_organization_id() and is_company_admin());
-- Copy prior SIM records without changing the source table.
insert into workspace_records(organization_id,module,data,legacy_key,created_at)
 select organization_id,'sim',jsonb_build_object('employee_id',employee_id,'employee_name',employee_name,'email_address',email_address,'department',department,'assign_location',assign_location,'sim_number',sim_number,'mobile_number',mobile_number,'account_number',account_number,'provider',provider,'sim_package',sim_package,'date_issued',date_issued,'date_returned',date_returned,'status',case when status='Excellent' then 'Active' else status end,'notes',notes,'attachments','[]'::jsonb),id::text,coalesce(created_at,now()) from devices where organization_id is not null and nullif(sim_number,'') is not null on conflict do nothing;
create or replace function public.save_workspace_record(p_module text,p_id uuid,p_data jsonb,p_version integer) returns public.workspace_records language plpgsql security invoker set search_path=public as $$
 declare result workspace_records; required text[]; k text; begin
 if not workspace_write(p_module) then raise exception 'Access denied'; end if;
 if p_module='sim' then required:=array['employee_id','employee_name','department','assign_location','mobile_number','sim_number','provider','date_issued','status'];
 elsif p_module='assets' then required:=array['employee_id','employee_name','department','assign_location','hardware','brand','serial_number','status'];
 elsif p_module='purchasing' then required:=array['request_number','request_date','requested_by','department','hardware','brand','quantity','status','priority'];
 else raise exception 'Unknown module'; end if;
 foreach k in array required loop if nullif(trim(p_data->>k),'') is null then raise exception 'Required field: %',k; end if; end loop;
 if p_module='purchasing' and ((p_data->>'quantity')::numeric<1 or mod((p_data->>'quantity')::numeric,1)<>0 or coalesce(nullif(p_data->>'estimated_cost',''),'0')::numeric<0) then raise exception 'Invalid quantity or cost'; end if;
 if nullif(p_data->>'date_returned','')::date < nullif(p_data->>'date_issued','')::date or nullif(p_data->>'warranty_end','')::date < nullif(p_data->>'warranty_start','')::date then raise exception 'Invalid date order'; end if;
 if jsonb_typeof(p_data->'attachments')<>'array' then raise exception 'Invalid attachments'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'attachments') a where a->>'path' not like current_organization_id()::text||'/'||p_module||'/%') then raise exception 'Invalid attachment scope'; end if;
 if p_id is null then insert into workspace_records(module,data) values(p_module,p_data) returning * into result;
 else update workspace_records set data=p_data,version=version+1,updated_at=now() where id=p_id and organization_id=current_organization_id() and module=p_module and version=p_version returning * into result; if result.id is null then raise exception 'Record changed or access denied. Refresh before saving.'; end if; end if;
 return result;
 end $$;
-- Direct writes are unavailable; the validation RPC is the write entry point.
revoke insert,update on workspace_records from authenticated;
alter function public.save_workspace_record(text,uuid,jsonb,integer) security definer;
-- Explicit tenant predicate is mandatory for the definer update below.
create or replace function public.guard_workspace_tenant() returns trigger language plpgsql set search_path=public as $$ begin
 if auth.uid() is not null and (new.organization_id<>current_organization_id() or not workspace_write(new.module)) then raise exception 'Access denied'; end if;
 if TG_OP='UPDATE' and (new.organization_id<>old.organization_id or new.module<>old.module) then raise exception 'Record scope is immutable'; end if;
 return new;end $$;
drop trigger if exists workspace_tenant_guard on workspace_records;
create trigger workspace_tenant_guard before insert or update on workspace_records for each row execute function guard_workspace_tenant();
create table if not exists public.workspace_choices(organization_id uuid not null default current_organization_id() references organizations(id),kind text not null,value text not null,uses bigint not null default 1,primary key(organization_id,kind,value),check(length(trim(value)) between 1 and 120));
alter table workspace_choices enable row level security;
drop policy if exists choices_read on workspace_choices;
create policy choices_read on workspace_choices for select to authenticated using(organization_id=current_organization_id());
create or replace function public.use_workspace_choice(p_kind text,p_value text) returns void language plpgsql security definer set search_path=public as $$ begin
 if not (workspace_write('sim') or workspace_write('assets') or workspace_write('purchasing')) then raise exception 'Access denied'; end if;
 if p_kind not in ('department','assign_location','hardware','brand','provider','sim_package','supplier','priority','sim_status','asset_status','purchase_status') then raise exception 'Unknown choice field'; end if;
 if length(trim(p_value)) not between 1 and 120 then raise exception 'Value must contain 1 to 120 characters'; end if;
 insert into workspace_choices(kind,value) values(p_kind,trim(p_value)) on conflict(organization_id,kind,value) do update set uses=workspace_choices.uses+1;end $$;
grant select,delete on workspace_records to authenticated;
grant select on workspace_choices to authenticated;
revoke all on function save_workspace_record(text,uuid,jsonb,integer),use_workspace_choice(text,text) from public;
grant execute on function save_workspace_record(text,uuid,jsonb,integer),use_workspace_choice(text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('workspace-files','workspace-files',false,10485760) on conflict(id) do nothing;
drop policy if exists workspace_files_read on storage.objects;
create policy workspace_files_read on storage.objects for select to authenticated using(bucket_id='workspace-files' and (storage.foldername(name))[1]=current_organization_id()::text and has_section_access((storage.foldername(name))[2]));
drop policy if exists workspace_files_insert on storage.objects;
create policy workspace_files_insert on storage.objects for insert to authenticated with check(bucket_id='workspace-files' and (storage.foldername(name))[1]=current_organization_id()::text and workspace_write((storage.foldername(name))[2]));
create or replace function public.audit_workspace_record() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into organization_audit_logs(organization_id,actor_id,action,details) values(coalesce(new.organization_id,old.organization_id),auth.uid(),'record_'||lower(TG_OP),jsonb_build_object('module',coalesce(new.module,old.module),'id',coalesce(new.id,old.id)));return coalesce(new,old);end $$;
drop trigger if exists workspace_audit on workspace_records;
create trigger workspace_audit after insert or update or delete on workspace_records for each row execute function audit_workspace_record();
drop policy if exists tenant_export_history_read on export_history;
create policy tenant_export_history_read on export_history for select to authenticated using(organization_id=current_organization_id() and has_section_access('exports'));
drop policy if exists tenant_export_history_insert on export_history;
create policy tenant_export_history_insert on export_history for insert to authenticated with check(organization_id=current_organization_id() and exported_by=auth.uid() and has_section_access('exports') and has_section_access(source) and (file_type='csv' or is_company_admin() or coalesce((get_my_export_permissions()->>file_type)::boolean,false)) and (source<>'purchasing' or is_company_admin() or coalesce((get_my_export_permissions()->>'financial')::boolean,false)));
-- Keep legacy non-SIM equipment and purchase data available, without inventing missing fields.
insert into workspace_records(organization_id,module,data,legacy_key,created_at)
 select organization_id,'assets',jsonb_build_object('employee_id',"empId",'employee_name',employee,'assign_location',location,'hardware',type,'model',name,'serial_number',coalesce(nullif(serial,''),'LEGACY-'||id),'status',case status when 'new' then 'Available' when 'used' then 'In Use' when 'damaged' then 'Damaged' else status end,'notes',notes,'attachments','[]'::jsonb),id::text,coalesce(created_at,now()) from devices where organization_id is not null and nullif(sim_number,'') is null on conflict do nothing;
insert into workspace_records(organization_id,module,data,legacy_key,created_at)
 select organization_id,'purchasing',jsonb_build_object('request_number','LEGACY-'||id,'request_date',date,'requested_by',"addedBy",'hardware',category,'estimated_cost',amount,'supplier',vendor,'invoice_number',"invoiceNo",'notes',description,'status','Draft','attachments','[]'::jsonb),id::text,coalesce(created_at,now()) from purchases where organization_id is not null on conflict do nothing;
-- Remove obsolete domain API access. Historical tables are retained for recovery.
revoke all on public.contracts,public.activities from authenticated,anon;
-- Return effective module permissions, including role defaults, to administration.
create or replace function public.list_organization_members()
returns table(user_id uuid,email text,full_name text,department text,role text,status text,joined_at timestamptz,permissions jsonb)
language sql stable security definer set search_path=public as $$
 select m.user_id,p.email,p.full_name,m.department,m.role,m.status,m.joined_at,
 (select jsonb_object_agg(s,case when m.role='company_admin' then true when s='administration' then false else coalesce((select mp.allowed from member_permissions mp where mp.organization_id=m.organization_id and mp.user_id=m.user_id and mp.section=s),case when m.role='manager' then true when m.role='operator' then s in ('sim','assets','purchasing') else s in ('sim','assets','reports') end) end) from unnest(array['sim','assets','purchasing','reports','exports','administration']) s)
 from organization_members m join profiles p on p.id=m.user_id where m.organization_id=current_organization_id() and is_company_admin() order by m.joined_at
 $$;
commit;
