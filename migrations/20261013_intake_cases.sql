begin;

create sequence if not exists public.intake_reference_seq;
create table if not exists public.intake_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null check(kind in ('report','device_request')), token_hash text not null unique, token_encrypted text not null,
 label text not null check(length(label) between 1 and 100), active boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), disabled_at timestamptz
);
create table if not exists public.intake_cases (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 link_id uuid references public.intake_links(id) on delete set null, kind text not null check(kind in ('report','device_request')),
 reference text not null unique, employee_name text not null, employee_number text not null, email text not null,
 department text not null, issue_type text, device_type text, description text not null,
 status text not null, attachment_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.intake_notes (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.intake_cases(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 body text not null check(length(body) between 1 and 3000), actor_id uuid references auth.users(id),
 old_status text, new_status text, created_at timestamptz not null default now()
);
create table if not exists public.intake_rate_limits (
 ip_hash text not null, link_id uuid not null references public.intake_links(id) on delete cascade,
 window_start timestamptz not null, submissions integer not null default 0,
 primary key(ip_hash,link_id,window_start)
);
create index if not exists intake_cases_org_created on public.intake_cases(organization_id,created_at desc);
create index if not exists intake_cases_org_status on public.intake_cases(organization_id,kind,status);
create index if not exists intake_notes_case on public.intake_notes(case_id,created_at);
alter table public.intake_links enable row level security;
alter table public.intake_cases enable row level security;
alter table public.intake_notes enable row level security;
alter table public.intake_rate_limits enable row level security;
revoke all on public.intake_links,public.intake_cases,public.intake_notes,public.intake_rate_limits from anon,authenticated;
grant all on public.intake_links,public.intake_cases,public.intake_notes,public.intake_rate_limits to service_role;
grant usage,select on sequence public.intake_reference_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('intake-images','intake-images',false,3145728,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;

create or replace function public.submit_intake_case(p_token_hash text,p_ip_hash text,p_data jsonb)
returns table(case_id uuid,case_reference text,case_email text,case_kind text)
language plpgsql security invoker set search_path=public as $$
declare v_link public.intake_links; v_case public.intake_cases; v_window timestamptz:=date_trunc('hour',now()); v_count integer;
begin
 select * into v_link from public.intake_links where token_hash=p_token_hash and active=true;
 if v_link.id is null then raise exception 'LINK_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash||v_link.id::text,0));
 insert into public.intake_rate_limits(ip_hash,link_id,window_start,submissions)
 values(p_ip_hash,v_link.id,v_window,1) on conflict(ip_hash,link_id,window_start)
 do update set submissions=public.intake_rate_limits.submissions+1 returning submissions into v_count;
 if v_count>5 then raise exception 'RATE_LIMITED'; end if;
 if (select count(*) from public.intake_cases where link_id=v_link.id and created_at>now()-interval '1 hour')>=100 then raise exception 'LINK_RATE_LIMITED'; end if;
 insert into public.intake_cases(organization_id,link_id,kind,reference,employee_name,employee_number,email,department,issue_type,device_type,description,status)
 values(v_link.organization_id,v_link.id,v_link.kind,'NE-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.intake_reference_seq')::text,7,'0'),
 p_data->>'employee_name',p_data->>'employee_number',p_data->>'email',p_data->>'department',
 case when v_link.kind='report' then p_data->>'issue_type' end,
 case when v_link.kind='device_request' then p_data->>'device_type' end,
 p_data->>'description','جديد') returning * into v_case;
 return query select v_case.id,v_case.reference,v_case.email,v_case.kind;
end $$;
revoke all on function public.submit_intake_case(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_intake_case(text,text,jsonb) to service_role;
commit;
