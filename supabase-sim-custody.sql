-- Convert the tenant asset register into an employee SIM custody register.
alter table public.devices alter column name drop not null;
alter table public.devices add column if not exists employee_id text;
alter table public.devices add column if not exists employee_name text;
alter table public.devices add column if not exists email_address text;
alter table public.devices add column if not exists department text;
alter table public.devices add column if not exists assign_location text;
alter table public.devices add column if not exists sim_number text;
alter table public.devices add column if not exists mobile_number text;
alter table public.devices add column if not exists account_number text;
alter table public.devices add column if not exists provider text;
alter table public.devices add column if not exists sim_package text;
alter table public.devices add column if not exists date_issued date;
alter table public.devices add column if not exists date_returned date;

create unique index if not exists devices_org_sim_number_unique
  on public.devices(organization_id, sim_number)
  where sim_number is not null;

create index if not exists devices_org_employee_id_idx
  on public.devices(organization_id, employee_id);

alter table public.devices drop constraint if exists devices_provider_check;
alter table public.devices add constraint devices_provider_check
  check (provider is null or provider in ('STC','Mobily','Zain'));

alter table public.devices drop constraint if exists devices_sim_package_check;
alter table public.devices add constraint devices_sim_package_check
  check (sim_package is null or sim_package in ('20GB','50GB','100GB','Unlimited'));

alter table public.devices drop constraint if exists devices_sim_status_check;
alter table public.devices add constraint devices_sim_status_check
  check (status is null or status in ('Excellent','Active','Returned','Damaged','Lost','Suspended')) not valid;

alter table public.devices drop constraint if exists devices_return_date_check;
alter table public.devices add constraint devices_return_date_check
  check (date_returned is null or date_issued is null or date_returned >= date_issued);

