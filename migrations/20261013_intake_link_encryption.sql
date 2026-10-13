begin;
alter table public.intake_links add column if not exists token_encrypted text;
alter table public.intake_links alter column token_encrypted set not null;
commit;
