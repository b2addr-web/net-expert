import { spawnSync } from 'node:child_process';

const containers = ['supabase_db_net-expert-security-phase4', process.argv.includes('--verify') ? 'supabase_db_net-expert-security-phase4g-verify' : 'supabase_db_net-expert-security-phase4g-clean'];
const query = `select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'policy',policyname,'cmd',cmd,'qual',qual,'check',with_check) order by schemaname,tablename,policyname),'[]'::jsonb) from pg_policies where schemaname in ('public','storage')`;
const snapshots = containers.map(container => {
  const result = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', query], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Policy query failed for ${container}.`);
  return JSON.parse(result.stdout.trim());
});
const label = row => `${row.schema}.${row.table}:${row.policy}`;
const left = new Map(snapshots[0].map(row => [label(row), row]));
const right = new Map(snapshots[1].map(row => [label(row), row]));
const names = [...new Set([...left.keys(), ...right.keys()])].sort();
const differences = names.filter(name => JSON.stringify(left.get(name)) !== JSON.stringify(right.get(name)));
console.log(`Existing policies: ${left.size}; fresh policies: ${right.size}; differences: ${differences.length}`);
for (const name of differences) console.log(`DIFF ${name}`);
const grantsQuery = `select coalesce(jsonb_object_agg(c.relname,jsonb_build_array(has_table_privilege('authenticated',c.oid,'SELECT'),has_table_privilege('authenticated',c.oid,'INSERT'),has_table_privilege('authenticated',c.oid,'UPDATE'),has_table_privilege('authenticated',c.oid,'DELETE'),has_table_privilege('anon',c.oid,'SELECT'))),'{}'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')`;
const grants = containers.map(container => {
  const result = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', grantsQuery], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`GRANT query failed for ${container}.`);
  return JSON.parse(result.stdout.trim());
});
const grantNames = [...new Set([...Object.keys(grants[0]), ...Object.keys(grants[1])])].sort();
const grantDifferences = grantNames.filter(name => JSON.stringify(grants[0][name]) !== JSON.stringify(grants[1][name]));
console.log(`Existing tables: ${Object.keys(grants[0]).length}; fresh tables: ${Object.keys(grants[1]).length}; GRANT differences: ${grantDifferences.length}`);
console.log('GRANT mismatch counts [authenticated SELECT,INSERT,UPDATE,DELETE; anon SELECT]:', [0,1,2,3,4].map(index => grantDifferences.filter(name => grants[0][name]?.[index] !== grants[1][name]?.[index]).length).join(','));
for (const name of grantDifferences) console.log(`GRANT DIFF public.${name}`);
process.exit(differences.length || grantDifferences.length ? 1 : 0);
