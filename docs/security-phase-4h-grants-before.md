# Phase 4H — Effective PostgreSQL Privilege Comparison

جدول الصلاحيات الفعلية. `SIUD` تعني SELECT/INSERT/UPDATE/DELETE، و`-` تعني عدم وجود الإذن. تقارن هذه الأداة `has_table_privilege` و`has_sequence_privilege` و`has_function_privilege`، وليس نص ACL فقط.

| Table | Existing auth | Fresh auth | Existing anon | Fresh anon | RLS | Decision |
|---|---|---|---|---|---|---|
| activities | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| assets | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| audit_log | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| contracts | SIUD | SIUD | ---- | ---- | ON | same |
| custody_events | SIUD | S--- | ---- | ---- | ON | canonical baseline required |
| devices | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| expenses | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| export_history | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| intake_cases | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| intake_link_aliases | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| intake_links | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| intake_notes | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| intake_rate_limits | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| inventory_items | SIUD | S--- | ---- | ---- | ON | canonical baseline required |
| knowledge_attachments | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| knowledge_folders | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| knowledge_items | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| login_audit | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| member_export_permissions | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| member_permissions | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| monitor_checks | SIUD | S--- | ---- | ---- | ON | canonical baseline required |
| monitor_incidents | SIUD | S--- | ---- | ---- | ON | canonical baseline required |
| monitor_sites | SIUD | S--- | ---- | ---- | ON | canonical baseline required |
| organization_audit_logs | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| organization_invitations | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| organization_members | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| organizations | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| platform_job_runs | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| platform_notification_log | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| profiles | SIUD | S--- | ---- | S--- | ON | canonical baseline required |
| purchases | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| scheduled_reports | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| service_subscriptions | SIUD | S--- | ---- | ---- | ON | canonical baseline required |
| user_presence | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| user_workspace_preferences | SIUD | ---- | ---- | ---- | ON | canonical baseline required |
| users | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| workspace_choices | SIUD | SIUD | ---- | SIUD | ON | canonical baseline required |
| workspace_records | SIUD | S--D | ---- | SIUD | ON | canonical baseline required |

**Table differences:** 37.

**sequences effective privilege differences:** 13/13.
- activities_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- assets_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[true,true,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- audit_log_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- contracts_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- devices_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- expenses_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[true,true,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- export_history_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- intake_reference_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- login_audit_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- monitor_checks_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- organization_audit_logs_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- purchases_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[true,true,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}
- users_id_seq: existing={"anon":[false,false,false],"service_role":[true,true,true],"authenticated":[false,false,false]}; fresh={"anon":[true,true,true],"service_role":[true,true,true],"authenticated":[true,true,true]}

**functions effective privilege differences:** 6/37.
- knowledge_attachment_stamp(): existing=[true,false,false,true]; fresh=[true,true,true,true]
- knowledge_folder_stamp(): existing=[true,false,false,true]; fresh=[true,true,true,true]
- knowledge_item_stamp(): existing=[true,false,false,true]; fresh=[true,true,true,true]
- knowledge_storage_readable(object_name text): existing=[true,false,true,true]; fresh=[true,true,true,true]
- save_workspace_record(p_module text, p_id uuid, p_data jsonb, p_version integer): existing=[true,false,true,true]; fresh=[true,true,true,true]
- use_workspace_choice(p_kind text, p_value text): existing=[true,false,true,true]; fresh=[true,true,true,true]

**Schema USAGE:** existing={"anon":true,"service_role":true,"authenticated":true}; fresh={"anon":true,"service_role":true,"authenticated":true}.
**Column ACL entries:** existing=0; fresh=0.
**information_schema.role_table_grants counts:** existing={"anon":0,"authenticated":156}; fresh={"anon":137,"authenticated":145}.
**pg_default_acl public:**
- existing: []
- fresh: [{"acl":"{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}","type":"S","owner":"postgres","schema":"public"},{"acl":"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","type":"f","owner":"postgres","schema":"public"},{"acl":"{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","type":"r","owner":"postgres","schema":"public"},{"acl":"{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}","type":"S","owner":"supabase_admin","schema":"public"},{"acl":"{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}","type":"f","owner":"supabase_admin","schema":"public"},{"acl":"{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}","type":"r","owner":"supabase_admin","schema":"public"}]
