-- Apply only after the protected Vercel API routes are live and verified.
begin;
select cron.schedule('netexpert-monitor-sites','* * * * *','select private.invoke_netexpert_job(''monitor'')');
-- 21:05 UTC is 00:05 in Asia/Riyadh (UTC+03:00, no daylight saving).
select cron.schedule('netexpert-subscription-alerts','5 21 * * *','select private.invoke_netexpert_job(''subscriptions'')');
commit;
