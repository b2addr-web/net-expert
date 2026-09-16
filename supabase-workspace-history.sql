begin;
alter table public.workspace_records add column if not exists updated_by uuid;
alter table public.workspace_records add column if not exists created_by_name text;
alter table public.workspace_records add column if not exists updated_by_name text;
create table if not exists public.workspace_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 record_id uuid not null, module text not null, version integer not null,
 data jsonb not null, changes jsonb not null default '{}', action text not null,
 actor_id uuid, actor_name text, occurred_at timestamptz not null default now(),
 unique(record_id,version,action)
);
alter table public.workspace_versions enable row level security;
drop policy if exists workspace_versions_read on public.workspace_versions;
create policy workspace_versions_read on public.workspace_versions for select to authenticated
 using(organization_id=current_organization_id() and has_section_access(module));
revoke all on public.workspace_versions from authenticated,anon;
grant select on public.workspace_versions to authenticated;
create index if not exists workspace_versions_record on public.workspace_versions(organization_id,record_id,version desc);
-- Existing history cannot be reconstructed: retain the current state as a baseline.
insert into public.workspace_versions(organization_id,record_id,module,version,data,action,actor_id,actor_name,occurred_at)
 select organization_id,id,module,version,data,'baseline',created_by,'Historical record',updated_at from public.workspace_records on conflict do nothing;
create or replace function public.stamp_workspace_record() returns trigger language plpgsql security definer set search_path=public as $$
declare actor text; begin
 select coalesce(nullif(full_name,''),email) into actor from profiles where id=auth.uid();
 if TG_OP='INSERT' then new.created_by:=auth.uid();new.created_by_name:=actor;new.created_at:=now();end if;
 new.updated_by:=auth.uid();new.updated_by_name:=actor;new.updated_at:=now();return new;
end $$;
drop trigger if exists workspace_stamp on public.workspace_records;
create trigger workspace_stamp before insert or update on public.workspace_records for each row execute function public.stamp_workspace_record();
create or replace function public.audit_workspace_record() returns trigger language plpgsql security definer set search_path=public as $$
declare delta jsonb; actor text; previous jsonb; current_data jsonb; begin
 previous:=case when TG_OP='INSERT' then '{}'::jsonb else old.data end;
 current_data:=case when TG_OP='DELETE' then '{}'::jsonb else new.data end;
 select coalesce(jsonb_object_agg(k,jsonb_build_object('old',previous->k,'new',current_data->k)),'{}'::jsonb) into delta
 from (select jsonb_object_keys(previous||current_data) k) keys where previous->k is distinct from current_data->k;
 select coalesce(nullif(full_name,''),email) into actor from profiles where id=auth.uid();
 insert into workspace_versions(organization_id,record_id,module,version,data,changes,action,actor_id,actor_name)
 values(coalesce(new.organization_id,old.organization_id),coalesce(new.id,old.id),coalesce(new.module,old.module),coalesce(new.version,old.version),case when TG_OP='DELETE' then old.data else new.data end,delta,lower(TG_OP),auth.uid(),actor);
 insert into organization_audit_logs(organization_id,actor_id,action,details) values(coalesce(new.organization_id,old.organization_id),auth.uid(),'record_'||lower(TG_OP),jsonb_build_object('module',coalesce(new.module,old.module),'id',coalesce(new.id,old.id),'changes',delta));
 return coalesce(new,old);end $$;
create or replace function public.bulk_edit_workspace(p_module text,p_records jsonb,p_patch jsonb) returns setof public.workspace_records language plpgsql security definer set search_path=public as $$
declare item jsonb;r workspace_records;k text; begin
 if not workspace_write(p_module) then raise exception 'Access denied';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 200 then raise exception 'Select between 1 and 200 records';end if;
 if jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'Select a field to update';end if;
 for k in select jsonb_object_keys(p_patch) loop
 if k not in ('status','department','assign_location','provider') or (k='provider' and p_module<>'sim') or (k='assign_location' and p_module='purchasing') then raise exception 'Unsupported quick-edit field';end if;
 end loop;
 -- Stable locking order avoids deadlocks; any failure rolls back the entire batch.
 for item in select value from jsonb_array_elements(p_records) order by value->>'id' loop
 select * into r from workspace_records where id=(item->>'id')::uuid and organization_id=current_organization_id() and module=p_module for update;
 if r.id is null or r.version<>(item->>'version')::integer or item->>'version' is null then raise exception 'Record changed or access denied. Refresh before saving.';end if;
 return next save_workspace_record(p_module,r.id,r.data||p_patch,r.version);
 end loop;end $$;
create or replace function public.restore_workspace_version(p_id uuid,p_version integer,p_current_version integer) returns public.workspace_records language plpgsql security definer set search_path=public as $$
declare snapshot workspace_versions;r workspace_records;begin
 select * into r from workspace_records where id=p_id and organization_id=current_organization_id() for update;
 if r.id is null or not workspace_write(r.module) then raise exception 'Access denied';end if;
 select * into snapshot from workspace_versions where record_id=p_id and organization_id=current_organization_id() and version=p_version and action<>'delete' order by occurred_at desc limit 1;
 if snapshot.id is null then raise exception 'Version not found';end if;
 return save_workspace_record(r.module,r.id,snapshot.data,p_current_version);
end $$;
revoke all on function public.bulk_edit_workspace(text,jsonb,jsonb),public.restore_workspace_version(uuid,integer,integer) from public;
grant execute on function public.bulk_edit_workspace(text,jsonb,jsonb),public.restore_workspace_version(uuid,integer,integer) to authenticated;
commit;

