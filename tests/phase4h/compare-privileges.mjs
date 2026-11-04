import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const targets = [
  ['existing', 'supabase_db_net-expert-security-phase4', '55432'],
  process.argv.includes('--phase4h')
    ? ['fresh', 'supabase_db_net-expert-security-phase4h-fresh', '57432']
    : ['fresh', 'supabase_db_net-expert-security-phase4g-verify', '56432'],
];
const run = (args) => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
function query(container, sql) {
  const result = run(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
  if (result.status !== 0) throw new Error(`Local privilege inspection failed for ${container}`);
  return JSON.parse(result.stdout.trim());
}
const tableSql = `select coalesce(jsonb_object_agg(c.relname,jsonb_build_object(
  'rls',c.relrowsecurity,
  'authenticated',jsonb_build_array(has_table_privilege('authenticated',c.oid,'SELECT'),has_table_privilege('authenticated',c.oid,'INSERT'),has_table_privilege('authenticated',c.oid,'UPDATE'),has_table_privilege('authenticated',c.oid,'DELETE'),has_table_privilege('authenticated',c.oid,'TRUNCATE'),has_table_privilege('authenticated',c.oid,'REFERENCES'),has_table_privilege('authenticated',c.oid,'TRIGGER')),
  'anon',jsonb_build_array(has_table_privilege('anon',c.oid,'SELECT'),has_table_privilege('anon',c.oid,'INSERT'),has_table_privilege('anon',c.oid,'UPDATE'),has_table_privilege('anon',c.oid,'DELETE'),has_table_privilege('anon',c.oid,'TRUNCATE'),has_table_privilege('anon',c.oid,'REFERENCES'),has_table_privilege('anon',c.oid,'TRIGGER')),
  'service_role',jsonb_build_array(has_table_privilege('service_role',c.oid,'SELECT'),has_table_privilege('service_role',c.oid,'INSERT'),has_table_privilege('service_role',c.oid,'UPDATE'),has_table_privilege('service_role',c.oid,'DELETE'),has_table_privilege('service_role',c.oid,'TRUNCATE'),has_table_privilege('service_role',c.oid,'REFERENCES'),has_table_privilege('service_role',c.oid,'TRIGGER')),
  'public_acl',coalesce((select jsonb_agg(x.privilege_type order by x.privilege_type) from aclexplode(c.relacl) x where x.grantee=0),'[]'::jsonb),
  'column_acl_count',(select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and a.attacl is not null)
)),'{}'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')`;
const sequenceSql = `select coalesce(jsonb_object_agg(c.relname,jsonb_build_object(
  'authenticated',jsonb_build_array(has_sequence_privilege('authenticated',c.oid,'USAGE'),has_sequence_privilege('authenticated',c.oid,'SELECT'),has_sequence_privilege('authenticated',c.oid,'UPDATE')),
  'anon',jsonb_build_array(has_sequence_privilege('anon',c.oid,'USAGE'),has_sequence_privilege('anon',c.oid,'SELECT'),has_sequence_privilege('anon',c.oid,'UPDATE')),
  'service_role',jsonb_build_array(has_sequence_privilege('service_role',c.oid,'USAGE'),has_sequence_privilege('service_role',c.oid,'SELECT'),has_sequence_privilege('service_role',c.oid,'UPDATE'))
)),'{}'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S'`;
const viewSql = `select coalesce(jsonb_object_agg(c.relname,jsonb_build_object('options',c.reloptions,'authenticated',jsonb_build_array(has_table_privilege('authenticated',c.oid,'SELECT'),has_table_privilege('authenticated',c.oid,'INSERT'),has_table_privilege('authenticated',c.oid,'UPDATE'),has_table_privilege('authenticated',c.oid,'DELETE')),'anon',jsonb_build_array(has_table_privilege('anon',c.oid,'SELECT'),has_table_privilege('anon',c.oid,'INSERT'),has_table_privilege('anon',c.oid,'UPDATE'),has_table_privilege('anon',c.oid,'DELETE')),'service_role',jsonb_build_array(has_table_privilege('service_role',c.oid,'SELECT'),has_table_privilege('service_role',c.oid,'INSERT'),has_table_privilege('service_role',c.oid,'UPDATE'),has_table_privilege('service_role',c.oid,'DELETE')))),'{}'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m')`;
const functionSql = `select coalesce(jsonb_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE'),has_function_privilege('authenticated',p.oid,'EXECUTE'),has_function_privilege('service_role',p.oid,'EXECUTE'))),'{}'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`;
const defaultSql = `select coalesce(jsonb_agg(jsonb_build_object('owner',defaclrole::regrole::text,'schema',coalesce(defaclnamespace::regnamespace::text,'global'),'type',defaclobjtype,'acl',defaclacl::text) order by defaclrole::regrole::text,defaclnamespace,defaclobjtype),'[]'::jsonb) from pg_default_acl where defaclnamespace='public'::regnamespace`;
const schemaSql = `select jsonb_build_object('anon',has_schema_privilege('anon','public','USAGE'),'authenticated',has_schema_privilege('authenticated','public','USAGE'),'service_role',has_schema_privilege('service_role','public','USAGE'))`;
const informationSql = `select jsonb_build_object('anon',(select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon'),'authenticated',(select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='authenticated'))`;
const snapshots = targets.map(([label, container, port]) => {
  const mapped = run(['port', container, '5432/tcp']);
  if (mapped.status !== 0 || !mapped.stdout.includes(`127.0.0.1:${port}`) && !mapped.stdout.includes(`0.0.0.0:${port}`)) {
    throw new Error(`Refusing unexpected database endpoint for ${label}`);
  }
  return { label, tables: query(container, tableSql), views: query(container, viewSql), sequences: query(container, sequenceSql), functions: query(container, functionSql), defaults: query(container, defaultSql), schema: query(container, schemaSql), informationSchema: query(container, informationSql) };
});
const mask = values => values?.map((value, index) => value ? 'SIUDTRG'[index] : '-').join('') || 'missing';
const lines = [
  '# Phase 4H — Effective PostgreSQL Privilege Comparison',
  '',
  'جدول الصلاحيات الفعلية. `SIUDTRG` تعني SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER، و`-` تعني عدم وجود الإذن. تقارن هذه الأداة `has_table_privilege` و`has_sequence_privilege` و`has_function_privilege`، وليس نص ACL فقط.',
  '',
  '| Table | Existing auth | Fresh auth | Existing anon | Fresh anon | RLS | Decision |',
  '|---|---|---|---|---|---|---|',
];
let differences = 0;
for (const name of [...new Set(snapshots.flatMap(snapshot => Object.keys(snapshot.tables)))].sort()) {
  const [a,b] = snapshots.map(snapshot => snapshot.tables[name]);
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) differences++;
  lines.push(`| ${name} | ${mask(a?.authenticated)} | ${mask(b?.authenticated)} | ${mask(a?.anon)} | ${mask(b?.anon)} | ${a?.rls && b?.rls ? 'ON' : 'CHECK'} | ${same ? 'same' : 'canonical baseline required'} |`);
}
lines.push('', `**Table differences:** ${differences}.`, '');
let otherDifferences = 0;
for (const category of ['views','sequences','functions']) {
  const names = [...new Set(snapshots.flatMap(snapshot => Object.keys(snapshot[category])))].sort();
  const mismatches = names.filter(name => JSON.stringify(snapshots[0][category][name]) !== JSON.stringify(snapshots[1][category][name]));
  otherDifferences += mismatches.length;
  lines.push(`**${category} effective privilege differences:** ${mismatches.length}/${names.length}.`);
  for (const name of mismatches) lines.push(`- ${name}: existing=${JSON.stringify(snapshots[0][category][name])}; fresh=${JSON.stringify(snapshots[1][category][name])}`);
  lines.push('');
}
lines.push(`**Schema USAGE:** existing=${JSON.stringify(snapshots[0].schema)}; fresh=${JSON.stringify(snapshots[1].schema)}.`);
lines.push(`**Column ACL entries:** existing=${Object.values(snapshots[0].tables).reduce((sum,row)=>sum+Number(row.column_acl_count),0)}; fresh=${Object.values(snapshots[1].tables).reduce((sum,row)=>sum+Number(row.column_acl_count),0)}.`);
lines.push(`**information_schema.role_table_grants counts:** existing=${JSON.stringify(snapshots[0].informationSchema)}; fresh=${JSON.stringify(snapshots[1].informationSchema)}.`);
lines.push('**pg_default_acl public:**');
for (const snapshot of snapshots) lines.push(`- ${snapshot.label}: ${JSON.stringify(snapshot.defaults)}`);
lines.push('');
const suffix = process.argv.includes('--after') ? 'after' : 'before';
const output = `docs/security-phase-4h-grants-${suffix}.md`;
writeFileSync(output, lines.join('\n'));
console.log(`Wrote ${output}; table differences=${differences}`);
if (process.argv.includes('--after') && (differences || otherDifferences || lines.some(line => line.includes('CHECK')))) process.exitCode = 1;
