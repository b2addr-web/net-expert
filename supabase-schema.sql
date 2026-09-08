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

-- ── السماح للجميع (الحماية في التطبيق) ────────────────────
create policy "allow_all_devices"   on devices   for all using (true) with check (true);
create policy "allow_all_users"     on users     for all using (true) with check (true);
create policy "allow_all_audit"     on audit_log for all using (true) with check (true);
create policy "allow_all_purchases" on purchases for all using (true) with check (true);
create policy "allow_all_expenses"  on expenses  for all using (true) with check (true);
create policy "allow_all_assets"    on assets    for all using (true) with check (true);

-- ── المستخدمون الافتراضيون ────────────────────────────────
insert into users (username, password, role, department, name, email)
values
  ('Badr',    'BADR050982538', 'admin',  'it',      'Badr',          'admin@netexpert.com'),
  ('viewer1', 'view123',       'viewer', 'it',      'موظف التقنية',  'it@netexpert.com'),
  ('finance1','fin123',        'viewer', 'finance', 'موظف المالية',  'finance@netexpert.com')
on conflict (username) do nothing;
