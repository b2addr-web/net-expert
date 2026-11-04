# Phase 4H — Effective PostgreSQL Privilege Comparison

جدول الصلاحيات الفعلية. `SIUDTRG` تعني SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER، و`-` تعني عدم وجود الإذن. تقارن هذه الأداة `has_table_privilege` و`has_sequence_privilege` و`has_function_privilege`، وليس نص ACL فقط.

| Table | Existing auth | Fresh auth | Existing anon | Fresh anon | RLS | Decision |
|---|---|---|---|---|---|---|
| activities | S------ | S------ | ------- | ------- | ON | same |
| assets | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| audit_log | SI----- | SI----- | ------- | ------- | ON | same |
| contracts | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| custody_events | S------ | S------ | ------- | ------- | ON | same |
| devices | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| expenses | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| export_history | SI----- | SI----- | ------- | ------- | ON | same |
| intake_cases | ------- | ------- | ------- | ------- | ON | same |
| intake_link_aliases | ------- | ------- | ------- | ------- | ON | same |
| intake_links | ------- | ------- | ------- | ------- | ON | same |
| intake_notes | ------- | ------- | ------- | ------- | ON | same |
| intake_rate_limits | ------- | ------- | ------- | ------- | ON | same |
| inventory_items | S------ | S------ | ------- | ------- | ON | same |
| knowledge_attachments | SI-D--- | SI-D--- | ------- | ------- | ON | same |
| knowledge_folders | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| knowledge_items | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| login_audit | S------ | S------ | ------- | ------- | ON | same |
| member_export_permissions | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| member_permissions | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| monitor_checks | S------ | S------ | ------- | ------- | ON | same |
| monitor_incidents | S------ | S------ | ------- | ------- | ON | same |
| monitor_sites | S------ | S------ | ------- | ------- | ON | same |
| organization_audit_logs | S------ | S------ | ------- | ------- | ON | same |
| organization_invitations | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| organization_members | S-U---- | S-U---- | ------- | ------- | ON | same |
| organizations | S------ | S------ | ------- | ------- | ON | same |
| platform_job_runs | ------- | ------- | ------- | ------- | ON | same |
| platform_notification_log | ------- | ------- | ------- | ------- | ON | same |
| profiles | S------ | S------ | ------- | ------- | ON | same |
| purchases | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| scheduled_reports | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| service_subscriptions | S------ | S------ | ------- | ------- | ON | same |
| user_presence | ------- | ------- | ------- | ------- | ON | same |
| user_workspace_preferences | ------- | ------- | ------- | ------- | ON | same |
| users | ------- | ------- | ------- | ------- | ON | same |
| workspace_choices | S------ | S------ | ------- | ------- | ON | same |
| workspace_records | SIUD--- | SIUD--- | ------- | ------- | ON | same |
| workspace_versions | S------ | S------ | ------- | ------- | ON | same |

**Table differences:** 0.

**views effective privilege differences:** 0/1.

**sequences effective privilege differences:** 0/13.

**functions effective privilege differences:** 0/41.

**Schema USAGE:** existing={"anon":true,"service_role":true,"authenticated":true}; fresh={"anon":true,"service_role":true,"authenticated":true}.
**Column ACL entries:** existing=0; fresh=0.
**information_schema.role_table_grants counts:** existing={"anon":0,"authenticated":70}; fresh={"anon":0,"authenticated":70}.
**pg_default_acl public:**
- existing: []
- fresh: [{"acl":"{postgres=rwU/postgres,service_role=rwU/postgres}","type":"S","owner":"postgres","schema":"public"},{"acl":"{postgres=X/postgres,service_role=X/postgres}","type":"f","owner":"postgres","schema":"public"},{"acl":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","type":"r","owner":"postgres","schema":"public"},{"acl":"{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}","type":"S","owner":"supabase_admin","schema":"public"},{"acl":"{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}","type":"f","owner":"supabase_admin","schema":"public"},{"acl":"{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}","type":"r","owner":"supabase_admin","schema":"public"}]
