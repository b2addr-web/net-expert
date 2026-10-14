begin;
alter table public.platform_notification_log
 add column if not exists subject text,
 add column if not exists message_body text;
create index if not exists platform_notification_retry
 on public.platform_notification_log(status,updated_at)
 where status='failed' and attempts<3;
commit;
