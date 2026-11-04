import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const phase4h = process.argv.includes('--phase4h');
const verify = process.argv.includes('--verify');
const container = phase4h ? 'supabase_db_net-expert-security-phase4h-fresh' : verify ? 'supabase_db_net-expert-security-phase4g-verify' : 'supabase_db_net-expert-security-phase4';
const port = phase4h ? '57432' : verify ? '56432' : '55432';
const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const mapped = docker(['port', container, '5432/tcp']);
if (mapped.status !== 0 || !mapped.stdout.includes(`:${port}`)) throw new Error('Refusing to upgrade a database outside the known local test port.');
const query = sql => {
  const result = docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
  if (result.status !== 0) throw new Error('Local schema or row count check failed.');
  return result.stdout.trim();
};
if (query("select to_regclass('public.organizations') is not null") !== 't') throw new Error('Expected existing local test schema.');
const countsSql = `select jsonb_build_object('organizations',(select count(*) from public.organizations),'devices',(select count(*) from public.devices),'workspace_records',(select count(*) from public.workspace_records),'knowledge_items',(select count(*) from public.knowledge_items),'storage_objects',(select count(*) from storage.objects))`;
const before = JSON.parse(query(countsSql));
const files = process.argv.includes('--job-only') ? ['migrations/20261102_platform_job_target_config.sql'] : process.argv.includes('--invitation-only') ? ['migrations/20261102_invitation_acceptance_hardening.sql'] : process.argv.includes('--baseline-only') ? ['migrations/20261102_canonical_privilege_baseline.sql'] : [
  'supabase-auth-repair.sql',
  'supabase-excel-import.sql',
  'supabase-workspace-history.sql',
  'migrations/20261102_canonical_privilege_baseline.sql',
];
for (const file of files) {
  const sql = readFileSync(file, 'utf8');
  const applied = docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], sql);
  if (applied.status !== 0) {
    const reason = (applied.stderr || '').split(/\r?\n/).find(line => line.includes('ERROR:')) || 'psql returned an error';
    throw new Error(`${file}: ${reason}`);
  }
  console.log(`PASS ${file}`);
}
const after = JSON.parse(query(countsSql));
for (const key of Object.keys(before)) {
  if (after[key] < before[key]) throw new Error(`Row preservation failed: ${key}`);
}
console.log(`Preserved counts: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
