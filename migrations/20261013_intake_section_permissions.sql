-- Add separate intake permissions without changing existing membership or records.
begin;

alter table public.member_permissions drop constraint if exists member_permissions_section_check;
alter table public.member_permissions add constraint member_permissions_section_check
  check (section in ('sim','assets','purchasing','reports','report','device_request','exports','administration'));

create or replace function public.has_section_access(section_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select section_name in ('sim','assets','purchasing','reports','report','device_request','exports','administration') and exists(
 select 1 from organization_members m where m.organization_id=current_organization_id() and m.user_id=auth.uid() and m.status='active' and
 (m.role='company_admin' or (section_name<>'administration' and coalesce((select allowed from member_permissions p where p.organization_id=m.organization_id and p.user_id=m.user_id and p.section=section_name),case when m.role='manager' then section_name in ('sim','assets','purchasing','reports','exports') when m.role='operator' then section_name in ('sim','assets','purchasing') else section_name in ('sim','assets','reports') end))))
 $$;

create or replace function public.get_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'organization_id',o.id,'organization_name',o.name,'role',m.role,'status',m.status,'department',m.department,
    'permissions',(select jsonb_object_agg(s,case when m.status='active' then public.has_section_access(s) else false end)
      from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration']) s)
  )
  from public.organization_members m join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid()
  order by (m.organization_id=public.current_organization_id()) desc, m.joined_at
  limit 1
$$;

create or replace function public.list_organization_members()
returns table(user_id uuid,email text,full_name text,department text,role text,status text,joined_at timestamptz,permissions jsonb)
language sql stable security definer set search_path=public as $$
 select m.user_id,p.email,p.full_name,m.department,m.role,m.status,m.joined_at,
 (select jsonb_object_agg(s,case when m.role='company_admin' then true when s='administration' then false else coalesce((select mp.allowed from member_permissions mp where mp.organization_id=m.organization_id and mp.user_id=m.user_id and mp.section=s),case when m.role='manager' then s in ('sim','assets','purchasing','reports','exports') when m.role='operator' then s in ('sim','assets','purchasing') else s in ('sim','assets','reports') end) end) from unnest(array['sim','assets','purchasing','reports','report','device_request','exports','administration']) s)
 from organization_members m join profiles p on p.id=m.user_id where m.organization_id=current_organization_id() and is_company_admin() order by m.joined_at
 $$;

commit;
