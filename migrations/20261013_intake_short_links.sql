begin;

create table if not exists public.intake_link_aliases (
 code_hash text primary key,
 link_id uuid not null unique references public.intake_links(id) on delete cascade,
 code_encrypted text not null,
 created_at timestamptz not null default now()
);

alter table public.intake_link_aliases enable row level security;
revoke all on public.intake_link_aliases from anon,authenticated;
grant all on public.intake_link_aliases to service_role;

commit;
