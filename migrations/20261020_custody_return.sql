-- Serialized devices and SIMs remain in workspace_records. Inventory_items keeps
-- its existing quantity-based items; available custody is a view of those records.
create table if not exists public.custody_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_id uuid references public.workspace_records(id) on delete set null,
  module text not null check (module in ('assets','sim')),
  identifier text not null,
  item_name text not null,
  action text not null check (action in ('pending_return','returned','assigned')),
  previous_state text not null,
  new_state text not null,
  previous_employee_id text,
  previous_employee_name text,
  previous_department text,
  new_employee_id text,
  new_employee_name text,
  new_department text,
  actor_id uuid not null references auth.users(id),
  actor_name text,
  occurred_at timestamptz not null default now()
);
create index if not exists custody_events_record_time on public.custody_events(organization_id,record_id,occurred_at desc);
create index if not exists custody_events_employee_time on public.custody_events(organization_id,previous_employee_id,occurred_at desc);
create index if not exists custody_available_lookup on public.workspace_records(organization_id,module)
  where module in ('assets','sim') and data->>'custody_state'='available';
create index if not exists custody_employee_lookup on public.workspace_records(organization_id,(data->>'employee_id'))
  where module in ('assets','sim');

alter table public.custody_events enable row level security;
revoke all on public.custody_events from public,anon,authenticated;
grant select on public.custody_events to authenticated;
grant select,insert on public.custody_events to service_role;
create policy custody_events_read on public.custody_events for select to authenticated
  using (organization_id=public.current_organization_id() and
    (public.has_section_access('inventory') or public.has_section_access(module)));

create or replace function public.guard_custody_state() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare old_state text;
begin
  if new.module not in ('assets','sim') then return new; end if;
  if TG_OP='INSERT' then
    if coalesce(new.data->>'custody_state','assigned')<>'assigned' then
      raise exception 'CUSTODY_TRANSITION_REQUIRED';
    end if;
    return new;
  end if;
  old_state:=coalesce(old.data->>'custody_state','assigned');
  if current_setting('app.custody_flow',true) is distinct from 'on' and (
    coalesce(new.data->>'custody_state','assigned') is distinct from old_state or
    (old_state in ('available','pending_return') and
      (new.data->>'employee_id',new.data->>'employee_name',new.data->>'department',new.data->>'email_address')
      is distinct from
      (old.data->>'employee_id',old.data->>'employee_name',old.data->>'department',old.data->>'email_address'))
  ) then raise exception 'CUSTODY_TRANSITION_REQUIRED'; end if;
  return new;
end $$;
drop trigger if exists workspace_custody_guard on public.workspace_records;
create trigger workspace_custody_guard before insert or update on public.workspace_records
  for each row execute function public.guard_custody_state();

create or replace function public.list_employee_custody(p_employee_id text)
returns setof public.workspace_records language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or public.current_organization_id() is null or not public.has_section_access('inventory') or length(trim(coalesce(p_employee_id,''))) not between 1 and 100 then
    raise exception 'ACCESS_DENIED';
  end if;
  return query select r.* from public.workspace_records r
    where r.organization_id=public.current_organization_id() and r.module in ('assets','sim')
      and trim(r.data->>'employee_id')=trim(p_employee_id)
      and coalesce(r.data->>'custody_state','assigned') in ('assigned','pending_return')
      and public.workspace_write(r.module)
    order by r.module,r.created_at,r.id;
end $$;

create or replace function public.list_available_custody()
returns table(id uuid,module text,identifier text,item_name text,brand text,model text,version integer,updated_at timestamptz,returned_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.has_section_access('inventory') then raise exception 'ACCESS_DENIED'; end if;
  return query select r.id,r.module,
    case when r.module='sim' then r.data->>'sim_number' else r.data->>'serial_number' end,
    case when r.module='sim' then coalesce(nullif(r.data->>'sim_package',''),'SIM') else coalesce(nullif(r.data->>'hardware',''),'Device') end,
    coalesce(r.data->>'brand',''),coalesce(r.data->>'model',''),r.version,r.updated_at,
    nullif(r.data->>'returned_at','')::timestamptz
  from public.workspace_records r where r.organization_id=public.current_organization_id()
    and r.module in ('assets','sim') and r.data->>'custody_state'='available'
  order by r.updated_at desc,r.id;
end $$;

create or replace function public.list_custody_employees()
returns table(employee_id text,employee_name text,department text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.has_section_access('inventory') or
     not (public.workspace_write('assets') or public.workspace_write('sim')) then raise exception 'ACCESS_DENIED'; end if;
  return query
  select distinct on (candidate.employee_id) candidate.employee_id,candidate.employee_name,candidate.department
  from (
    select trim(r.data->>'employee_id') employee_id,r.data->>'employee_name' employee_name,r.data->>'department' department,r.updated_at moment
      from public.workspace_records r where r.organization_id=public.current_organization_id() and r.module in ('assets','sim') and public.workspace_write(r.module)
    union all
    select trim(e.previous_employee_id),e.previous_employee_name,e.previous_department,e.occurred_at
      from public.custody_events e where e.organization_id=public.current_organization_id() and public.workspace_write(e.module)
    union all
    select trim(e.new_employee_id),e.new_employee_name,e.new_department,e.occurred_at
      from public.custody_events e where e.organization_id=public.current_organization_id() and public.workspace_write(e.module)
  ) candidate
  where nullif(candidate.employee_id,'') is not null and nullif(candidate.employee_name,'') is not null
  order by candidate.employee_id,candidate.moment desc;
end $$;

create or replace function public.return_employee_custody(p_employee_id text,p_items jsonb)
returns setof public.workspace_records language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; r public.workspace_records; changed public.workspace_records;
  state text; received boolean; new_data jsonb; actor text; org uuid;
begin
  org:=public.current_organization_id();
  if auth.uid() is null or org is null or not public.has_section_access('inventory') or
     length(trim(coalesce(p_employee_id,''))) not between 1 and 100 then raise exception 'ACCESS_DENIED'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 or
    (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then
    raise exception 'INVALID_SELECTION';
  end if;
  select coalesce(nullif(full_name,''),email) into actor from public.profiles where id=auth.uid();
  for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'received')<>'boolean' or
       nullif(item->>'version','') is null then raise exception 'INVALID_SELECTION'; end if;
    select * into r from public.workspace_records where id=(item->>'id')::uuid and organization_id=org
      and module in ('assets','sim') for update;
    if r.id is null or r.version is distinct from (item->>'version')::integer or
       trim(coalesce(r.data->>'employee_id',''))<>trim(p_employee_id) or not public.workspace_write(r.module) then
      raise exception 'RECORD_CHANGED_OR_ACCESS_DENIED';
    end if;
    state:=coalesce(r.data->>'custody_state','assigned');received:=(item->>'received')::boolean;
    if state not in ('assigned','pending_return') or (state='pending_return' and not received) then
      raise exception 'CUSTODY_ALREADY_PROCESSED';
    end if;
    if received and nullif(trim(case when r.module='sim' then r.data->>'sim_number' else r.data->>'serial_number' end),'') is null then
      raise exception 'MISSING_IDENTIFIER';
    end if;
    if received then
      new_data:=r.data||jsonb_build_object('custody_state','available','employee_id','','employee_name','',
        'department','','email_address','','last_employee_id',r.data->>'employee_id',
        'last_employee_name',r.data->>'employee_name','last_department',r.data->>'department',
        'last_employee_email',r.data->>'email_address','returned_at',now());
    else
      new_data:=r.data||jsonb_build_object('custody_state','pending_return');
    end if;
    perform set_config('app.custody_flow','on',true);
    update public.workspace_records set data=new_data,version=version+1,updated_at=now()
      where id=r.id and version=r.version returning * into changed;
    insert into public.custody_events(organization_id,record_id,module,identifier,item_name,action,previous_state,new_state,
      previous_employee_id,previous_employee_name,previous_department,actor_id,actor_name)
    values(org,r.id,r.module,case when r.module='sim' then r.data->>'sim_number' else r.data->>'serial_number' end,
      case when r.module='sim' then coalesce(nullif(r.data->>'sim_package',''),'SIM') else coalesce(nullif(r.data->>'hardware',''),'Device') end,
      case when received then 'returned' else 'pending_return' end,state,
      case when received then 'available' else 'pending_return' end,
      r.data->>'employee_id',r.data->>'employee_name',r.data->>'department',auth.uid(),actor);
    return next changed;
  end loop;
end $$;

create or replace function public.assign_available_custody(p_id uuid,p_version integer,p_employee_id text,p_employee_name text,p_department text,p_location text default null)
returns public.workspace_records language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.workspace_records; changed public.workspace_records; org uuid; actor text;
  target_id text; target_name text; target_department text; existing record;
  new_data jsonb;
begin
  org:=public.current_organization_id();target_id:=trim(coalesce(p_employee_id,''));
  if auth.uid() is null or org is null or not public.has_section_access('inventory') or
     length(target_id) not between 1 and 100 or length(trim(coalesce(p_employee_name,''))) not between 1 and 160 or
     length(trim(coalesce(p_department,''))) not between 1 and 100 or length(coalesce(p_location,''))>160 then raise exception 'INVALID_EMPLOYEE'; end if;
  select * into r from public.workspace_records where id=p_id and organization_id=org and module in ('assets','sim') for update;
  if r.id is null or r.version is distinct from p_version or r.data->>'custody_state'<>'available' or
     not public.workspace_write(r.module) then raise exception 'RECORD_CHANGED_OR_ACCESS_DENIED'; end if;
  select e.employee_name,e.department into existing from public.list_custody_employees() e where e.employee_id=target_id limit 1;
  target_name:=coalesce(nullif(existing.employee_name,''),trim(p_employee_name));
  target_department:=coalesce(nullif(existing.department,''),trim(p_department));
  if r.module='assets' and nullif(trim(coalesce(p_location,r.data->>'assign_location','')),'') is null then
    raise exception 'LOCATION_REQUIRED'; end if;
  new_data:=r.data||jsonb_build_object('custody_state','assigned','employee_id',target_id,
    'employee_name',target_name,'department',target_department,'email_address','',
    'assigned_at',now());
  if r.module='assets' then
    new_data:=new_data||jsonb_build_object('custody_date',(now() at time zone 'Asia/Riyadh')::date,
      'assign_location',coalesce(nullif(trim(p_location),''),r.data->>'assign_location'));
  else
    new_data:=new_data||jsonb_build_object('date_issued',(now() at time zone 'Asia/Riyadh')::date);
  end if;
  perform set_config('app.custody_flow','on',true);
  update public.workspace_records set data=new_data,version=version+1,updated_at=now()
    where id=r.id and version=r.version returning * into changed;
  select coalesce(nullif(full_name,''),email) into actor from public.profiles where id=auth.uid();
  insert into public.custody_events(organization_id,record_id,module,identifier,item_name,action,previous_state,new_state,
    previous_employee_id,previous_employee_name,previous_department,new_employee_id,new_employee_name,new_department,actor_id,actor_name)
  values(org,r.id,r.module,case when r.module='sim' then r.data->>'sim_number' else r.data->>'serial_number' end,
    case when r.module='sim' then coalesce(nullif(r.data->>'sim_package',''),'SIM') else coalesce(nullif(r.data->>'hardware',''),'Device') end,
    'assigned','available','assigned',r.data->>'last_employee_id',r.data->>'last_employee_name',
    r.data->>'last_department',target_id,target_name,target_department,auth.uid(),actor);
  return changed;
end $$;

revoke all on function public.list_employee_custody(text),public.list_available_custody(),
  public.list_custody_employees(),public.return_employee_custody(text,jsonb),
  public.assign_available_custody(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.list_employee_custody(text),public.list_available_custody(),
  public.list_custody_employees(),public.return_employee_custody(text,jsonb),
  public.assign_available_custody(uuid,integer,text,text,text,text) to authenticated;
