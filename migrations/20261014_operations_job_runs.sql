-- Follow-up for deployments where operations_modules predates scheduler health tracking.
create table if not exists public.platform_job_runs (
 task text primary key check(task in ('monitor','subscriptions')),
 last_run_at timestamptz not null default now(), status text not null check(status in ('success','failed')),
 processed integer not null default 0, error_code text
);
alter table public.platform_job_runs enable row level security;
revoke all on public.platform_job_runs from anon,authenticated;
