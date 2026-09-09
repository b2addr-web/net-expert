-- Net Expert multi-tenant foundation. Safe to run repeatedly.
create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('company_admin','manager','operator','viewer')),
  status text not null default 'active' check (status in ('active','suspended','invited')),
  department text,
  joined_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table if not exists public.member_permissions (
  organization_id uuid not null,
  user_id uuid not null,
  section text not null check (section in ('dashboard','assets','operations','contracts','procurement','reports','users','settings')),
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id,section),
  foreign key (organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('company_admin','manager','operator','viewer')),
  department text,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id,email)
);

create table if not exists public.organization_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public
as $$ select organization_id from organization_members where user_id=auth.uid() and status='active' order by joined_at limit 1 $$;

create or replace function public.is_company_admin(org uuid default public.current_organization_id())
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from organization_members where organization_id=org and user_id=auth.uid() and role='company_admin' and status='active') $$;

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public
as $$
  select coalesce(
    (select allowed from member_permissions where organization_id=current_organization_id() and user_id=auth.uid() and section=section_name),
    (select case role
      when 'company_admin' then true
      when 'manager' then section_name in ('dashboard','assets','operations','contracts','procurement','reports')
      when 'operator' then section_name in ('dashboard','assets','operations')
      else section_name in ('dashboard','assets','reports') end
     from organization_members where organization_id=current_organization_id() and user_id=auth.uid()), false)
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare org_id uuid; invited_role text; invited_department text; org_name text;
begin
  insert into profiles(id,email,full_name,role,status)
  values(new.id,new.email,nullif(new.raw_user_meta_data->>'full_name',''),'viewer','active')
  on conflict(id) do update set email=excluded.email, full_name=coalesce(profiles.full_name,excluded.full_name), updated_at=now();

  select organization_id,role,department into org_id,invited_role,invited_department
  from organization_invitations where lower(email)=lower(new.email) and status='pending' order by created_at desc limit 1;

  if org_id is null then
    org_name := coalesce(nullif(new.raw_user_meta_data->>'organization_name',''), split_part(new.email,'@',2));
    insert into organizations(name,slug,created_by)
    values(org_name, lower(regexp_replace(org_name,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(new.id::text,1,8), new.id)
    returning id into org_id;
    invited_role := 'company_admin';
  else
    update organization_invitations set status='accepted' where organization_id=org_id and lower(email)=lower(new.email);
  end if;

  insert into organization_members(organization_id,user_id,role,status,department)
  values(org_id,new.id,coalesce(invited_role,'viewer'),'active',invited_department)
  on conflict(organization_id,user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path=public
as $$
select jsonb_build_object(
 'organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
 'permissions',(select jsonb_object_agg(s,has_section_access(s)) from unnest(array['dashboard','assets','operations','contracts','procurement','reports','users','settings']) s)
) from organization_members m join organizations o on o.id=m.organization_id where m.user_id=auth.uid() and m.status='active' order by m.joined_at limit 1
$$;
grant execute on function public.get_my_access() to authenticated;

create or replace function public.list_organization_members()
returns table(user_id uuid,email text,full_name text,department text,role text,status text,joined_at timestamptz,permissions jsonb)
language sql stable security definer set search_path=public as $$
 select m.user_id,p.email,p.full_name,m.department,m.role,m.status,m.joined_at,
   (select coalesce(jsonb_object_agg(s.section,s.allowed),'{}'::jsonb) from member_permissions s where s.organization_id=m.organization_id and s.user_id=m.user_id)
 from organization_members m join profiles p on p.id=m.user_id
 where m.organization_id=current_organization_id() and is_company_admin(m.organization_id)
 order by m.joined_at
$$;
grant execute on function public.list_organization_members() to authenticated;

create or replace function public.admin_update_member(member_id uuid,new_role text,new_status text,new_department text,access jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare org uuid:=current_organization_id(); item record;
begin
 if not is_company_admin(org) then raise exception 'ADMIN_REQUIRED'; end if;
 if member_id=auth.uid() and (new_role<>'company_admin' or new_status<>'active') then raise exception 'CANNOT_REMOVE_OWN_ADMIN_ACCESS'; end if;
 update organization_members set role=new_role,status=new_status,department=new_department where organization_id=org and user_id=member_id;
 for item in select * from jsonb_each_text(coalesce(access,'{}'::jsonb)) loop
   insert into member_permissions(organization_id,user_id,section,allowed) values(org,member_id,item.key,item.value::boolean)
   on conflict(organization_id,user_id,section) do update set allowed=excluded.allowed,updated_at=now();
 end loop;
 perform log_organization_event('member_access_updated',member_id,jsonb_build_object('role',new_role,'status',new_status,'permissions',access));
end $$;
grant execute on function public.admin_update_member(uuid,text,text,text,jsonb) to authenticated;

create or replace function public.log_organization_event(action_name text,target_id uuid default null,event_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin insert into organization_audit_logs(organization_id,actor_id,action,target_user_id,details)
values(current_organization_id(),auth.uid(),action_name,target_id,coalesce(event_details,'{}'::jsonb)); end $$;
grant execute on function public.log_organization_event(text,uuid,jsonb) to authenticated;

-- Backfill the existing first account into a company without exposing other tenants.
do $$ declare u uuid; org uuid; begin
  for u in select id from auth.users loop
    if not exists(select 1 from organization_members where user_id=u) then
      insert into organizations(name,slug,created_by) values('Net Expert Workspace','workspace-'||substr(u::text,1,8),u) returning id into org;
      insert into organization_members values(org,u,'company_admin','active',null,now());
    end if;
  end loop;
end $$;

-- Add tenant ownership to operational records.
alter table devices add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table purchases add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table expenses add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table assets add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table audit_log add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table devices alter column organization_id set default public.current_organization_id();
alter table purchases alter column organization_id set default public.current_organization_id();
alter table expenses alter column organization_id set default public.current_organization_id();
alter table assets alter column organization_id set default public.current_organization_id();
alter table audit_log alter column organization_id set default public.current_organization_id();
update devices set organization_id=(select id from organizations order by created_at limit 1) where organization_id is null;
update purchases set organization_id=(select id from organizations order by created_at limit 1) where organization_id is null;
update expenses set organization_id=(select id from organizations order by created_at limit 1) where organization_id is null;
update assets set organization_id=(select id from organizations order by created_at limit 1) where organization_id is null;
update audit_log set organization_id=(select id from organizations order by created_at limit 1) where organization_id is null;

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table member_permissions enable row level security;
alter table organization_invitations enable row level security;
alter table organization_audit_logs enable row level security;

drop policy if exists tenant_organizations on organizations;
create policy tenant_organizations on organizations for select to authenticated using(id=current_organization_id());
drop policy if exists tenant_members_read on organization_members;
create policy tenant_members_read on organization_members for select to authenticated using(organization_id=current_organization_id());
drop policy if exists tenant_members_admin_update on organization_members;
create policy tenant_members_admin_update on organization_members for update to authenticated using(is_company_admin(organization_id)) with check(is_company_admin(organization_id));
drop policy if exists tenant_permissions on member_permissions;
create policy tenant_permissions on member_permissions for select to authenticated using(organization_id=current_organization_id());
drop policy if exists tenant_permissions_admin on member_permissions;
create policy tenant_permissions_admin on member_permissions for all to authenticated using(is_company_admin(organization_id)) with check(is_company_admin(organization_id));
drop policy if exists tenant_invites_admin on organization_invitations;
create policy tenant_invites_admin on organization_invitations for all to authenticated using(is_company_admin(organization_id)) with check(is_company_admin(organization_id));
drop policy if exists tenant_audit_admin on organization_audit_logs;
create policy tenant_audit_admin on organization_audit_logs for select to authenticated using(is_company_admin(organization_id));

-- Replace global data policies with tenant + section checks.
drop policy if exists devices_authenticated_read on devices; drop policy if exists devices_admin_insert on devices; drop policy if exists devices_admin_update on devices; drop policy if exists devices_admin_delete on devices;
drop policy if exists tenant_devices_read on devices; drop policy if exists tenant_devices_write on devices; drop policy if exists tenant_devices_update on devices; drop policy if exists tenant_devices_delete on devices;
create policy tenant_devices_read on devices for select to authenticated using(organization_id=current_organization_id() and has_section_access('assets'));
create policy tenant_devices_write on devices for insert to authenticated with check(organization_id=current_organization_id() and has_section_access('assets'));
create policy tenant_devices_update on devices for update to authenticated using(organization_id=current_organization_id() and has_section_access('assets')) with check(organization_id=current_organization_id());
create policy tenant_devices_delete on devices for delete to authenticated using(organization_id=current_organization_id() and is_company_admin());
drop policy if exists audit_authenticated_read on audit_log; drop policy if exists audit_authenticated_insert on audit_log;
drop policy if exists tenant_audit_read on audit_log; drop policy if exists tenant_audit_insert on audit_log;
create policy tenant_audit_read on audit_log for select to authenticated using(organization_id=current_organization_id());
create policy tenant_audit_insert on audit_log for insert to authenticated with check(organization_id=current_organization_id());
drop policy if exists purchases_admin_access on purchases; drop policy if exists expenses_admin_access on expenses; drop policy if exists financial_assets_admin_access on assets;
drop policy if exists tenant_purchases on purchases; drop policy if exists tenant_expenses on expenses; drop policy if exists tenant_financial_assets on assets;
create policy tenant_purchases on purchases for all to authenticated using(organization_id=current_organization_id() and has_section_access('procurement')) with check(organization_id=current_organization_id() and has_section_access('procurement'));
create policy tenant_expenses on expenses for all to authenticated using(organization_id=current_organization_id() and has_section_access('reports')) with check(organization_id=current_organization_id() and has_section_access('reports'));
create policy tenant_financial_assets on assets for all to authenticated using(organization_id=current_organization_id() and has_section_access('assets')) with check(organization_id=current_organization_id() and has_section_access('assets'));

grant select on organizations,organization_members,member_permissions,organization_invitations,organization_audit_logs to authenticated;
grant insert,update,delete on member_permissions,organization_invitations to authenticated;
grant update on organization_members to authenticated;
