begin;

create table public.intake_notification_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 enabled boolean not null default false,
 email_enabled boolean not null default true,
 bell_enabled boolean not null default true,
 default_recipient uuid,
 device_recipients uuid[] not null default '{}'
);

create table public.intake_categories (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 active boolean not null default true,
 recipients uuid[] not null default '{}',
 unique (organization_id,id)
);
create unique index intake_categories_name on public.intake_categories (organization_id,lower(trim(name)));

alter table public.intake_cases add unique (organization_id,id),
 add column category_id uuid,
 add column assignee_id uuid,
 add foreign key (organization_id,category_id) references public.intake_categories(organization_id,id);

create table public.intake_routing_audit (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 case_id uuid,
 actor_id uuid,
 action text not null,
 details jsonb not null default '{}',
 created_at timestamptz not null default now(),
 foreign key (organization_id,case_id) references public.intake_cases(organization_id,id) on delete cascade
);
create index intake_routing_audit_case on public.intake_routing_audit(organization_id,case_id,created_at desc);

create table public.intake_notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 case_id uuid not null,
 recipient_id uuid not null,
 event_key text not null,
 show_in_bell boolean not null,
 read_at timestamptz,
 email_status text not null check (email_status in ('disabled','pending','sending','sent','failed','skipped')),
 attempts integer not null default 0,
 retry_at timestamptz not null default now(),
 email_error text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key (organization_id,case_id) references public.intake_cases(organization_id,id) on delete cascade,
 unique (organization_id,case_id,recipient_id,event_key)
);
create index intake_notification_inbox on public.intake_notifications(organization_id,recipient_id,created_at desc)
 where show_in_bell;
create index intake_notification_queue on public.intake_notifications(retry_at)
 where email_status in ('pending','sending');

alter table public.intake_notification_settings enable row level security;
alter table public.intake_categories enable row level security;
alter table public.intake_routing_audit enable row level security;
alter table public.intake_notifications enable row level security;
revoke all on public.intake_notification_settings,public.intake_categories,public.intake_routing_audit,
 public.intake_notifications from public,anon,authenticated;
grant select,insert,update on public.intake_notification_settings,public.intake_categories,
 public.intake_routing_audit,public.intake_notifications to service_role;
grant select (organization_id,user_id,section,allowed) on public.member_permissions to service_role;

create function public.intake_eligible(p_org uuid,p_kind text,p_write boolean default false)
returns table(user_id uuid,role text) language sql stable security invoker set search_path=public as $$
 select m.user_id,m.role::text
 from organization_members m
 where m.organization_id=p_org and m.status='active' and p_kind in ('report','device_request')
 and (not p_write or m.role in ('company_admin','manager','operator'))
 and (m.role='company_admin' or exists (
  select 1 from member_permissions p where p.organization_id=p_org and p.user_id=m.user_id
   and p.section=p_kind and p.allowed
 ))
$$;

create function public.intake_save_routing(p_org uuid,p_actor uuid,p_action text,p_data jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare
 v_id uuid := (p_data->>'id')::uuid;
 v_default uuid := (p_data->>'default_recipient')::uuid;
 v_recipients uuid[] := array(select distinct jsonb_array_elements_text(p_data->'recipients')::uuid);
 v_kind text := case when p_action='settings' then 'device_request' else 'report' end;
begin
 if not exists(select 1 from intake_eligible(p_org,'report',true) e where e.user_id=p_actor and e.role='company_admin')
 then raise exception 'NOT_AUTHORIZED'; end if;
 if exists (select unnest(v_recipients) except select e.user_id from intake_eligible(p_org,v_kind) e)
 or (v_default is not null and not exists(select 1 from intake_eligible(p_org,'report') e where e.user_id=v_default))
 then raise exception 'INVALID_RECIPIENT'; end if;
 if p_action='settings' then
  insert into intake_notification_settings values(p_org,(p_data->>'enabled')::boolean,
   (p_data->>'email_enabled')::boolean,(p_data->>'bell_enabled')::boolean,v_default,v_recipients)
  on conflict (organization_id) do update set enabled=excluded.enabled,email_enabled=excluded.email_enabled,
   bell_enabled=excluded.bell_enabled,default_recipient=excluded.default_recipient,device_recipients=excluded.device_recipients;
 elsif p_action='category' then
  if v_id is null then
   insert into intake_categories(organization_id,name,active,recipients)
    values(p_org,trim(p_data->>'name'),(p_data->>'active')::boolean,v_recipients) returning id into v_id;
  else
   update intake_categories set name=trim(p_data->>'name'),active=(p_data->>'active')::boolean,recipients=v_recipients
    where organization_id=p_org and id=v_id;
   if not found then raise exception 'NOT_FOUND'; end if;
  end if;
 else raise exception 'INVALID_ACTION';
 end if;
 insert into intake_routing_audit(organization_id,actor_id,action,details)
  values(p_org,p_actor,p_action,p_data || jsonb_build_object('id',v_id));
end $$;

create function public.intake_route_new_case()
returns trigger language plpgsql security invoker set search_path=public as $$
declare
 v_settings intake_notification_settings;
 v_candidates uuid[];
 v_recipients uuid[];
begin
 select * into v_settings from intake_notification_settings where organization_id=new.organization_id;
 if not found then
  v_settings.enabled:=false; v_settings.email_enabled:=true; v_settings.bell_enabled:=true;
 end if;
 if new.kind='report' then
  select array(select e.user_id from intake_eligible(new.organization_id,new.kind) e where e.user_id=any(c.recipients))
   into v_candidates from intake_categories c where c.organization_id=new.organization_id and c.id=new.category_id and c.active;
  if coalesce(cardinality(v_candidates),0)=0 then
   select array(select e.user_id from intake_eligible(new.organization_id,new.kind) e where e.user_id=v_settings.default_recipient)
    into v_candidates;
  end if;
 else
  select array(select e.user_id from intake_eligible(new.organization_id,new.kind) e where e.user_id=any(v_settings.device_recipients))
   into v_candidates;
 end if;
 if coalesce(cardinality(v_candidates),0)=0 and v_settings.enabled then
  select array(select e.user_id from intake_eligible(new.organization_id,new.kind) e where e.role='company_admin') into v_candidates;
 end if;
 v_recipients:=coalesce(v_candidates,'{}');
 if not v_settings.enabled or not (v_settings.bell_enabled or v_settings.email_enabled) or cardinality(v_recipients)=0 then
  insert into intake_routing_audit(organization_id,case_id,action,details)
   values(new.organization_id,new.id,'notification_skipped',
    jsonb_build_object('reason',case when v_settings.enabled and (v_settings.bell_enabled or v_settings.email_enabled)
     then 'NO_ELIGIBLE_RECIPIENT' else 'NOTIFICATIONS_DISABLED' end));
  return new;
 end if;
 insert into intake_notifications(organization_id,case_id,recipient_id,event_key,show_in_bell,email_status)
 select new.organization_id,new.id,recipient,'created',v_settings.bell_enabled,
  case when v_settings.email_enabled then 'pending' else 'disabled' end from unnest(v_recipients) recipient
 on conflict do nothing;
 return new;
end $$;

create function public.intake_select_category()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_category intake_categories;
begin
 if new.kind='report' then
  select * into v_category from intake_categories c where c.organization_id=new.organization_id and c.active
   and (c.id::text=new.issue_type or lower(trim(c.name))=lower(trim(new.issue_type)))
   order by (c.id::text=new.issue_type) desc,c.id limit 1;
  if found then
   new.category_id:=v_category.id;
   new.issue_type:=v_category.name;
  elsif new.issue_type ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'INVALID_CATEGORY';
  end if;
 end if;
 return new;
end $$;
create trigger intake_case_category before insert on public.intake_cases for each row execute function public.intake_select_category();
create trigger intake_case_routing after insert on public.intake_cases for each row execute function public.intake_route_new_case();

create function public.intake_assign_case(p_org uuid,p_actor uuid,p_case uuid,p_recipient uuid,p_expected uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_case intake_cases; v_settings intake_notification_settings; v_event uuid;
begin
 if not exists(select 1 from intake_eligible(p_org,'report',true) e where e.user_id=p_actor) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into v_case from intake_cases where organization_id=p_org and id=p_case and kind='report' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if v_case.assignee_id is not distinct from p_recipient then return null; end if;
 if v_case.assignee_id is distinct from p_expected then raise exception 'CASE_CHANGED'; end if;
 if p_recipient is not null and not exists(select 1 from intake_eligible(p_org,'report',true) e where e.user_id=p_recipient)
 then raise exception 'INVALID_RECIPIENT'; end if;
 update intake_cases set assignee_id=p_recipient,updated_at=now() where organization_id=p_org and id=p_case;
 insert into intake_routing_audit(organization_id,case_id,actor_id,action,details)
 values(p_org,p_case,p_actor,'assigned',jsonb_build_object('from',v_case.assignee_id,'to',p_recipient)) returning id into v_event;
 select * into v_settings from intake_notification_settings where organization_id=p_org;
 if p_recipient is not null and coalesce(v_settings.enabled,false)
 and (coalesce(v_settings.bell_enabled,true) or coalesce(v_settings.email_enabled,true)) then
  insert into intake_notifications(organization_id,case_id,recipient_id,event_key,show_in_bell,email_status)
   values(p_org,p_case,p_recipient,v_event::text,coalesce(v_settings.bell_enabled,true),
    case when coalesce(v_settings.email_enabled,true) then 'pending' else 'disabled' end);
 end if;
 return v_event;
end $$;

create function public.intake_claim_email(p_org uuid,p_case uuid)
returns setof public.intake_notifications language plpgsql security invoker set search_path=public as $$
begin
 update intake_notifications set email_status='failed',email_error='DELIVERY_UNCONFIRMED'
 where email_status='sending' and attempts>=3 and retry_at<=now()
 and (p_org is null or organization_id=p_org) and (p_case is null or case_id=p_case);
 return query
 with next_batch as (
  select id from intake_notifications where email_status in ('pending','sending') and attempts<3 and retry_at<=now()
   and (p_org is null or organization_id=p_org) and (p_case is null or case_id=p_case)
  order by retry_at limit 16 for update skip locked
 )
 update intake_notifications n set email_status='sending',attempts=n.attempts+1,retry_at=now()+interval '3 minutes'
 from next_batch where n.id=next_batch.id returning n.*;
end $$;

create function public.intake_read_notifications(p_org uuid,p_user uuid,p_id uuid)
returns void language sql security invoker set search_path=public as $$
 update intake_notifications n set read_at=now() from intake_cases c
 where c.id=n.case_id and c.organization_id=n.organization_id and n.organization_id=p_org
 and n.recipient_id=p_user and n.show_in_bell and n.read_at is null and (p_id is null or n.id=p_id)
 and exists(select 1 from intake_eligible(p_org,c.kind) e where e.user_id=p_user)
$$;

revoke execute on function public.intake_eligible(uuid,text,boolean),public.intake_save_routing(uuid,uuid,text,jsonb),
 public.intake_select_category(),public.intake_route_new_case(),public.intake_assign_case(uuid,uuid,uuid,uuid,uuid),
 public.intake_claim_email(uuid,uuid),public.intake_read_notifications(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.intake_eligible(uuid,text,boolean),public.intake_save_routing(uuid,uuid,text,jsonb),
 public.intake_select_category(),public.intake_route_new_case(),public.intake_assign_case(uuid,uuid,uuid,uuid,uuid),
 public.intake_claim_email(uuid,uuid),public.intake_read_notifications(uuid,uuid,uuid) to service_role;

commit;
