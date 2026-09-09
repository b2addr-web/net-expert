-- ══════════════════════════════════════════════════════════
-- Net Expert v3 — Supabase Database Schema
-- شغّل هذا الكود في: Supabase → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════

-- ── جدول الأجهزة ──────────────────────────────────────────
create table if not exists devices (
  id              bigserial primary key,
  name            text not null,
  type            text,
  status          text default 'new',
  serial          text,
  location        text,
  online          boolean default false,
  employee        text,
  "empId"         text,
  notes           text,
  "addedBy"       text,
  "addedAt"       timestamptz default now(),
  "updatedBy"     text,
  "updatedByEmail" text,
  "updatedAt"     timestamptz,
  "attachmentUrl"  text,
  "attachmentName" text,
  "attachmentLabel" text,
  created_at      timestamptz default now()
);

-- ── جدول المستخدمين (مع القسم) ────────────────────────────
create table if not exists users (
  id         bigserial primary key,
  username   text unique not null,
  password   text not null,
  role       text default 'viewer',
  department text default 'it',
  name       text,
  email      text,
  created_at timestamptz default now()
);

-- ── جدول سجل العمليات ─────────────────────────────────────
create table if not exists audit_log (
  id           bigserial primary key,
  time         timestamptz default now(),
  action       text,
  "deviceName" text,
  "deviceId"   text,
  "oldVal"     text,
  "newVal"     text,
  "userName"   text,
  "userEmail"  text
);

-- ── جداول الوحدة المالية ───────────────────────────────────
create table if not exists purchases (
  id             bigserial primary key,
  description    text not null,
  amount         numeric default 0,
  vendor         text,
  category       text,
  "invoiceNo"    text,
  date           date default current_date,
  "attachmentUrl"  text,
  "attachmentName" text,
  "addedBy"      text,
  created_at     timestamptz default now()
);

create table if not exists expenses (
  id             bigserial primary key,
  description    text not null,
  amount         numeric default 0,
  vendor         text,
  category       text,
  "invoiceNo"    text,
  date           date default current_date,
  "attachmentUrl"  text,
  "attachmentName" text,
  "addedBy"      text,
  created_at     timestamptz default now()
);

create table if not exists assets (
  id             bigserial primary key,
  description    text not null,
  amount         numeric default 0,
  vendor         text,
  category       text,
  "invoiceNo"    text,
  date           date default current_date,
  "attachmentUrl"  text,
  "attachmentName" text,
  "addedBy"      text,
  created_at     timestamptz default now()
);

-- ── تفعيل RLS ──────────────────────────────────────────────
alter table devices   enable row level security;
alter table users     enable row level security;
alter table audit_log enable row level security;
alter table purchases enable row level security;
alter table expenses  enable row level security;
alter table assets    enable row level security;

-- ── Passwordless identity profiles ─────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  department  text,
  role        text not null default 'viewer' check (role in ('viewer','it','finance','admin')),
  status      text not null default 'active' check (status in ('active','suspended','pending_access')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists login_audit (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  session_id  uuid,
  event_name  text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;
alter table login_audit enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active') $$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into profiles(id,email,full_name,role,status)
  values(new.id,new.email,nullif(new.raw_user_meta_data->>'full_name',''),'viewer','active')
  on conflict(id) do update set
    email = excluded.email,
    full_name = coalesce(profiles.full_name, excluded.full_name),
    updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.protect_profile_access()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if (new.role is distinct from old.role or new.status is distinct from old.status) and not public.is_admin() then
    raise exception 'Only administrators can change role or account status';
  end if;
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists protect_profile_access_trigger on profiles;
create trigger protect_profile_access_trigger before update on profiles
for each row execute function public.protect_profile_access();

create or replace function public.record_auth_event(event_name text, event_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public
as $$ begin
  insert into login_audit(user_id,session_id,event_name,details)
  values(auth.uid(), nullif(auth.jwt()->>'session_id','')::uuid, event_name, coalesce(event_details,'{}'::jsonb));
end $$;

revoke all on login_audit from anon, authenticated;
grant execute on function public.record_auth_event(text,jsonb) to anon, authenticated;

-- Remove the prototype policies that exposed all records to the public key.
drop policy if exists "allow_all_devices" on devices;
drop policy if exists "allow_all_users" on users;
drop policy if exists "allow_all_audit" on audit_log;
drop policy if exists "allow_all_purchases" on purchases;
drop policy if exists "allow_all_expenses" on expenses;
drop policy if exists "allow_all_assets" on assets;
drop policy if exists "profiles_read_own_or_admin" on profiles;
drop policy if exists "profiles_update_own_or_admin" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "login_audit_admin_read" on login_audit;
drop policy if exists "devices_authenticated_read" on devices;
drop policy if exists "devices_admin_insert" on devices;
drop policy if exists "devices_admin_update" on devices;
drop policy if exists "devices_admin_delete" on devices;
drop policy if exists "audit_authenticated_read" on audit_log;
drop policy if exists "audit_authenticated_insert" on audit_log;
drop policy if exists "purchases_admin_access" on purchases;
drop policy if exists "expenses_admin_access" on expenses;
drop policy if exists "financial_assets_admin_access" on assets;

create policy "profiles_read_own_or_admin" on profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on profiles for update to authenticated
using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "profiles_insert_own" on profiles for insert to authenticated
with check (id = auth.uid() and role = 'viewer');
create policy "login_audit_admin_read" on login_audit for select to authenticated
using (public.is_admin());

create policy "devices_authenticated_read" on devices for select to authenticated using (true);
create policy "devices_admin_insert" on devices for insert to authenticated with check (public.is_admin());
create policy "devices_admin_update" on devices for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "devices_admin_delete" on devices for delete to authenticated using (public.is_admin());
create policy "audit_authenticated_read" on audit_log for select to authenticated using (true);
create policy "audit_authenticated_insert" on audit_log for insert to authenticated with check (auth.uid() is not null);
create policy "purchases_admin_access" on purchases for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "expenses_admin_access" on expenses for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "financial_assets_admin_access" on assets for all to authenticated using (public.is_admin()) with check (public.is_admin());
