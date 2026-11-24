begin;

create schema if not exists private;

create table public.commerce_owners (
 user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.commerce_settings (
 id boolean primary key default true check (id),
 free_limit integer not null default 10 check (free_limit between 0 and 100000),
 free_days integer check (free_days between 1 and 36500),
 monthly_price numeric(12,2) not null default 0 check (monthly_price>=0),
 notice_days integer not null default 14 check (notice_days between 1 and 90)
);
insert into public.commerce_settings default values;

create table public.commerce_accounts (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 plan text not null default 'unclassified' check (plan in ('unclassified','free','paid','trial')),
 offer_granted boolean not null default false,
 eligible_signup boolean not null default false,
 internal_trial boolean not null default false,
 starts_on date,
 ends_on date,
 monthly_price numeric(12,2) check (monthly_price>=0),
 check (ends_on is null or (starts_on is not null and ends_on>=starts_on)),
 check (not internal_trial or (plan='trial' and not offer_granted)),
 check (plan<>'paid' or (starts_on is not null and monthly_price>0))
);
create index commerce_offer_grants on public.commerce_accounts(organization_id) where offer_granted;

create table public.commerce_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 reference text not null check (length(trim(reference)) between 1 and 100),
 amount numeric(12,2) not null check (amount>0),
 received_on date not null,
 recorded_by uuid not null,
 created_at timestamptz not null default now()
);
create unique index commerce_receipt_reference on public.commerce_receipts(organization_id,lower(trim(reference)));

create table public.commerce_events (
 id bigint generated always as identity primary key,
 organization_id uuid references public.organizations(id) on delete set null,
 actor_id uuid,
 action text not null,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index commerce_registration_events on public.commerce_events(created_at desc) where action='registered';

alter table public.commerce_owners enable row level security;
alter table public.commerce_settings enable row level security;
alter table public.commerce_accounts enable row level security;
alter table public.commerce_receipts enable row level security;
alter table public.commerce_events enable row level security;
revoke all on public.commerce_owners,public.commerce_settings,public.commerce_accounts,
 public.commerce_receipts,public.commerce_events from public,anon,authenticated;
grant select on public.commerce_owners to service_role;
grant select,insert,update on public.commerce_settings,public.commerce_accounts to service_role;
grant select,insert on public.commerce_receipts,public.commerce_events to service_role;
grant usage on sequence public.commerce_events_id_seq to service_role;
grant select (id,name,created_at) on public.organizations to service_role;
grant select (organization_id,status) on public.organization_members to service_role;

create function public.commerce_today() returns date
language sql stable security invoker set search_path='' as $$
 select (now() at time zone 'Asia/Riyadh')::date
$$;

-- Only new companies created by the existing registration workflow are eligible.
-- A singleton row serializes seat claims and settings edits across transactions.
create function private.commerce_claim_offer(p_org uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_settings public.commerce_settings; v_today date:=public.commerce_today();
begin
 select * into v_settings from public.commerce_settings where id for update;
 if not exists(select 1 from public.commerce_accounts a join public.organizations o on o.id=a.organization_id
  join auth.users u on u.id=o.created_by
  where a.organization_id=p_org and a.eligible_signup and a.plan='unclassified'
   and not a.internal_trial and not a.offer_granted and u.email_confirmed_at is not null)
 then return; end if;
 if (select count(*) from public.commerce_accounts where offer_granted)<v_settings.free_limit then
  update public.commerce_accounts set plan='free', offer_granted=true, eligible_signup=false, starts_on=v_today,
   ends_on=case when v_settings.free_days is not null then v_today+v_settings.free_days-1 end
   where organization_id=p_org;
  insert into public.commerce_events(organization_id,action) values(p_org,'offer_granted');
 else
  update public.commerce_accounts set eligible_signup=false where organization_id=p_org;
 end if;
end $$;

create function private.commerce_new_company()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.commerce_accounts(organization_id,eligible_signup) values(new.id,new.created_by is not null);
 insert into public.commerce_events(organization_id,action) values(new.id,'registered');
 if new.created_by is not null and exists(select 1 from auth.users where id=new.created_by and email_confirmed_at is not null) then
  perform private.commerce_claim_offer(new.id);
 end if;
 return new;
end $$;

create function private.commerce_confirm_company()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_org uuid;
begin
 for v_org in select o.id from public.organizations o join public.commerce_accounts a on a.organization_id=o.id
  where o.created_by=new.id and a.eligible_signup order by o.created_at,o.id
 loop
  perform private.commerce_claim_offer(v_org);
 end loop;
 return new;
end $$;

create trigger commerce_on_company_created after insert on public.organizations
 for each row execute function private.commerce_new_company();
create trigger commerce_on_signup_confirmed after update of email_confirmed_at on auth.users
 for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
 execute function private.commerce_confirm_company();

create function public.commerce_dashboard(p_actor uuid,p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_settings public.commerce_settings; v_today date:=public.commerce_today(); v_data jsonb;
begin
 if not exists(select 1 from public.commerce_owners where user_id=p_actor) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into v_settings from public.commerce_settings where id;
 with company as (
  select o.id,o.name,o.created_at,coalesce(a.plan,'unclassified') plan,coalesce(a.internal_trial,false) internal_trial,
   coalesce(a.offer_granted,false) offer_granted,a.starts_on,a.ends_on,a.monthly_price,
   coalesce(m.members,0) members,
   case when coalesce(m.active,0)>0 then 'active' when coalesce(m.suspended,0)>0 then 'suspended' else 'pending' end status
  from public.organizations o left join public.commerce_accounts a on a.organization_id=o.id
  left join (select organization_id,count(*) members,count(*) filter(where status='active') active,
    count(*) filter(where status='suspended') suspended from public.organization_members group by organization_id) m
   on m.organization_id=o.id
 ), metrics as (
  select count(*) registered,count(*) filter(where status='active') active,count(*) filter(where status='suspended') suspended,
   count(*) filter(where status='pending') pending,count(*) filter(where plan='free') free,count(*) filter(where plan='paid') paid,
   count(*) filter(where plan='trial') trial,count(*) filter(where plan='unclassified') unclassified,
   count(*) filter(where offer_granted) seats_used,
   coalesce(sum(monthly_price) filter(where plan='paid' and status='active' and starts_on<=v_today
    and (ends_on is null or ends_on>=v_today)),0) expected_monthly
  from company
 )
 select jsonb_build_object('settings',to_jsonb(v_settings)-'id','today',v_today,
  'metrics',to_jsonb(metrics)||jsonb_build_object(
   'seats_remaining',greatest(v_settings.free_limit-seats_used,0),
   'actual_revenue',(select coalesce(sum(amount),0) from public.commerce_receipts where received_on<=v_today)),
  'companies',coalesce((select jsonb_agg(c) from (select * from company order by created_at desc,id limit 50 offset greatest(p_page,0)*50) c),'[]'::jsonb),
  'upcoming',coalesce((select jsonb_agg(c) from (select id,name,ends_on from company where plan='free'
   and ends_on between v_today and v_today+v_settings.notice_days order by ends_on,id limit 50) c),'[]'::jsonb),
  'registrations',coalesce((select jsonb_agg(c) from (select e.id,o.name,e.created_at from public.commerce_events e
   join public.organizations o on o.id=e.organization_id where e.action='registered' order by e.created_at desc,e.id desc limit 30) c),'[]'::jsonb))
 into v_data from metrics;
 return v_data;
end $$;

create function public.commerce_update(p_actor uuid,p_action text,p_data jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
 v_org uuid:=(p_data->>'organizationId')::uuid;
 v_today date:=public.commerce_today();
 v_end date:=(p_data->>'endsOn')::date;
 v_amount numeric:=(p_data->>'amount')::numeric;
 v_settings public.commerce_settings;
 v_account public.commerce_accounts;
begin
 if not exists(select 1 from public.commerce_owners where user_id=p_actor) then raise exception 'NOT_AUTHORIZED'; end if;
 select * into v_settings from public.commerce_settings where id for update;
 if p_action='settings' then
  if (p_data->>'freeLimit')::integer<(select count(*) from public.commerce_accounts where offer_granted) then
   raise exception 'LIMIT_BELOW_ALLOCATED';
  end if;
  update public.commerce_settings set free_limit=(p_data->>'freeLimit')::integer,free_days=(p_data->>'freeDays')::integer,
   monthly_price=(p_data->>'monthlyPrice')::numeric,notice_days=(p_data->>'noticeDays')::integer where id;
 else
  if not exists(select 1 from public.organizations where id=v_org) then raise exception 'COMPANY_NOT_FOUND'; end if;
  insert into public.commerce_accounts(organization_id) values(v_org) on conflict do nothing;
  select * into v_account from public.commerce_accounts where organization_id=v_org for update;
  case p_action
   when 'extend' then
    if v_account.plan<>'free' or (v_end is not null and (v_end<v_today or v_account.ends_on is null or v_end<=v_account.ends_on)) then
     raise exception 'INVALID_EXTENSION';
    end if;
    update public.commerce_accounts set ends_on=v_end where organization_id=v_org;
   when 'paid' then
    if v_account.plan='paid' or v_settings.monthly_price<=0 or (v_end is not null and v_end<v_today) then raise exception 'INVALID_PAID_PLAN'; end if;
    update public.commerce_accounts set plan='paid',eligible_signup=false,internal_trial=false,starts_on=v_today,
     ends_on=v_end,monthly_price=v_settings.monthly_price where organization_id=v_org;
   when 'trial' then
    if v_account.plan='paid' or (v_end is not null and v_end<v_today) then raise exception 'INVALID_TRIAL'; end if;
    update public.commerce_accounts set plan='trial',eligible_signup=false,internal_trial=true,offer_granted=false,
     starts_on=v_today,ends_on=v_end,monthly_price=null where organization_id=v_org;
   when 'receipt' then
    if v_account.plan<>'paid' or (p_data->>'receivedOn')::date>v_today then raise exception 'INVALID_RECEIPT'; end if;
    insert into public.commerce_receipts(organization_id,reference,amount,received_on,recorded_by)
     values(v_org,trim(p_data->>'reference'),v_amount,(p_data->>'receivedOn')::date,p_actor);
   else raise exception 'INVALID_ACTION';
  end case;
 end if;
 insert into public.commerce_events(organization_id,actor_id,action,details) values(v_org,p_actor,p_action,p_data);
end $$;

revoke all on function private.commerce_claim_offer(uuid),private.commerce_new_company(),private.commerce_confirm_company(),
 public.commerce_today(),public.commerce_dashboard(uuid,integer),public.commerce_update(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_today(),public.commerce_dashboard(uuid,integer),
 public.commerce_update(uuid,text,jsonb) to service_role;

commit;
