import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const phase4h = process.argv.includes('--phase4h');
const verify = process.argv.includes('--verify');
const project = phase4h ? 'net-expert-security-phase4h-fresh' : verify ? 'net-expert-security-phase4g-verify' : 'net-expert-security-phase4g-clean';
const workdir = phase4h ? 'tests/phase4h-fresh' : verify ? 'tests/phase4g-verify' : 'tests/phase4g-clean';
const config = readFileSync(join(process.cwd(), workdir, 'supabase/config.toml'), 'utf8');
if (!config.includes(`project_id = "${project}"`) || !config.includes(`port = ${phase4h ? 57432 : 56432}`) || !config.includes(`port = ${phase4h ? 57431 : 56431}`)) {
  throw new Error('The isolated project ID and loopback ports are not configured as expected.');
}
const names = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
if (names.includes(`supabase_db_${project}`)) {
  console.log('The clean Phase 4G test stack is already running.');
  process.exit(0);
}
try {
  execSync(`pnpm exec supabase start --workdir ${workdir} --exclude studio,postgres-meta,realtime,edge-runtime,logflare,vector,imgproxy,mailpit,supavisor`, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000, maxBuffer: 8 * 1024 * 1024,
  });
  console.log('The isolated Phase 4G Supabase stack started successfully. Credentials were not printed.');
} catch (error) {
  console.error(`The isolated Supabase stack did not start (status=${error.status ?? 'unknown'}). Credentials were not printed.`);
  process.exit(1);
}
