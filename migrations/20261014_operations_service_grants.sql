begin;
grant select,insert,update,delete on
 public.service_subscriptions,
 public.monitor_sites,
 public.monitor_checks,
 public.monitor_incidents,
 public.inventory_items,
 public.platform_notification_log,
 public.platform_job_runs
to service_role;
grant usage,select on sequence public.monitor_checks_id_seq to service_role;
grant select on public.monitor_site_statistics to service_role;
commit;
