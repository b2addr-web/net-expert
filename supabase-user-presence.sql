-- Server-only activity timestamps. No existing membership or report rows are changed.
create table if not exists public.user_presence (
  organization_id uuid not null,
  user_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint user_presence_member_fkey foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade
);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;
grant select, insert, update, delete on table public.user_presence to service_role;
