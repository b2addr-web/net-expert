import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const container = process.argv.includes('--phase4h') ? 'supabase_db_net-expert-security-phase4h-fresh' : process.argv.includes('--verify') ? 'supabase_db_net-expert-security-phase4g-verify' : 'supabase_db_net-expert-security-phase4g-clean';
const docker = (...args) => spawnSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const ports = docker('port', container, '5432/tcp');
if (ports.status !== 0 || !ports.stdout.includes(process.argv.includes('--phase4h') ? '57432' : '56432')) throw new Error('Refusing to use a database outside the isolated test port.');
const existing = docker('exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', "select to_regclass('public.organizations') is not null");
if (existing.status !== 0 || existing.stdout.trim() !== 'f') throw new Error('Refusing to reapply schema to a nonempty test database.');

const base = [
  'supabase-schema.sql', 'supabase-multitenant.sql', 'supabase-auth-repair.sql',
  'supabase-export-center.sql', 'supabase-workspace.sql', 'supabase-excel-import.sql',
  'supabase-workspace-history.sql', 'supabase-user-presence.sql',
  'supabase-sim-custody.sql', 'supabase-security-hardening.sql',
];
const migrations = [
  '20261011_remove_legacy_password_column.sql', '20261011_remove_report_logos.sql', '20261011_restrict_profile_mutations.sql',
  '20261012_allow_existing_member_audit.sql', '20261012_existing_account_workspaces.sql', '20261012_import_all_excel_rows.sql', '20261012_scope_profile_access_to_owner.sql',
  '20261013_intake_cases.sql', '20261013_intake_link_encryption.sql', '20261013_intake_section_permissions.sql', '20261013_intake_short_links.sql',
  '20261014_operations_modules.sql', '20261014_operations_job_runs.sql', '20261014_operations_jobs.sql',
  '20261014_operations_notification_retry.sql', '20261014_operations_recipient_grants.sql', '20261014_operations_service_grants.sql', '20261014_operations_uniqueness.sql',
  '20261016_monitoring_upgrade.sql', '20261020_custody_return.sql', '20261020_custody_event_indexes.sql',
  '20261020_sidebar_knowledge.sql', '20261020_knowledge_write_roles.sql',
  '20261021_knowledge_split.sql', '20261021_knowledge_attachments.sql', '20261021_knowledge_trigger_privileges.sql',
  '20261024_devices_write_policy_hardening.sql', '20261024_full_write_policy_hardening.sql',
  '20261102_contracts_explicit_permission.sql', '20261102_financial_policy_alignment.sql',
  '20261102_knowledge_linked_object_delete_guard.sql', '20261102_knowledge_read_permission_fix.sql',
  '20261102_invitation_acceptance_hardening.sql',
  '20261102_platform_job_target_config.sql',
  '20261102_canonical_privilege_baseline.sql',
];
for (const file of [...base, ...migrations.map(name => `migrations/${name}`)]) {
  const sql = readFileSync(join(root, file), 'utf8');
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    cwd: root, input: sql, encoding: 'utf8', windowsHide: true, maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || '').split(/\r?\n/).find(line => line.includes('ERROR:')) || 'psql returned an error';
    console.error(`FAIL ${file}: ${detail}`);
    process.exit(1);
  }
  console.log(`PASS ${file}`);
}
console.log('Fresh schema chain completed. The cron schedule migration was intentionally excluded because pg_cron is unavailable in this local image.');
