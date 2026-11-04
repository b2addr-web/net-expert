import { execSync, spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const playwright = process.argv.includes('--playwright');
const phase4h = process.argv.includes('--phase4h');
const verify = process.argv.includes('--verify');
const clean = process.argv.includes('--clean') || verify || phase4h;
const apiPort = phase4h ? '57431' : clean ? '56431' : '55431';
const dbPort = phase4h ? '57432' : clean ? '56432' : '55432';
const appPort = phase4h ? '3015' : clean ? '3014' : '3013';
let status;
try {
  const output = execSync(clean ? `pnpm exec supabase status --workdir ${phase4h ? 'tests/phase4h-fresh' : verify ? 'tests/phase4g-verify' : 'tests/phase4g-clean'} --output json` : 'pnpm exec supabase status --output json', {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  status = JSON.parse(output);
} catch (error) {
  console.error(`Local Supabase status could not be read safely (code=${error.code || 'unknown'}, status=${error.status ?? 'none'}). No credentials were printed.`);
  process.exit(1);
}

const api = new URL(status.API_URL);
const db = new URL(status.DB_URL);
if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.port !== apiPort ||
    db.hostname !== '127.0.0.1' || db.port !== dbPort ||
    !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  console.error('Refusing test run: the target is not the configured local Supabase instance.');
  process.exit(1);
}

const env = {
  ...process.env,
  RUN_LOCAL_SUPABASE_TESTS: '1',
  SUPABASE_LOCAL_URL: api.href.replace(/\/$/, ''),
  SUPABASE_LOCAL_ANON_KEY: status.ANON_KEY,
  SUPABASE_LOCAL_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_URL: api.href.replace(/\/$/, ''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  RESEND_API_KEY: '',
  RESEND_FROM_EMAIL: '',
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${appPort}`,
  INTAKE_LINK_SECRET: 'phase4g-local-only-secret-with-more-than-32-characters',
  NETEXPERT_LOCAL_APP_URL: `http://127.0.0.1:${appPort}`,
  ...(playwright ? {
    NEXT_PUBLIC_SECURITY_TEST_MODE: '1',
    NEXT_PUBLIC_SECURITY_TEST_SUPABASE_URL: api.href.replace(/\/$/, ''),
    NEXT_PUBLIC_SECURITY_TEST_ANON_KEY: status.ANON_KEY,
  } : {}),
  ...(clean ? {} : { LOCAL_MAIL_URL: 'http://127.0.0.1:54324' }),
  ...(verify || phase4h ? { LOCAL_CRON_CONTAINER: phase4h ? 'supabase_db_net-expert-security-phase4h-fresh' : 'supabase_db_net-expert-security-phase4g-verify' } : {}),
};
let app;
try {
  let occupied = false;
  try { const response = await fetch(env.NETEXPERT_LOCAL_APP_URL, { signal: AbortSignal.timeout(800) }); occupied = response.status > 0; } catch {}
  if (occupied) throw new Error('The local test port is already occupied.');
  app = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `pnpm exec next ${playwright ? 'dev' : 'start'} -p ${appPort}`], { cwd: root, env, stdio: 'ignore', windowsHide: true })
    : spawn('pnpm', ['exec', 'next', playwright ? 'dev' : 'start', '-p', appPort], { cwd: root, env, stdio: 'ignore' });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (app.exitCode !== null) break;
    try { await fetch(env.NETEXPERT_LOCAL_APP_URL, { signal: AbortSignal.timeout(800) }); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Local Next.js did not become reachable.');
} catch (error) {
  console.error(`Local API startup failed: ${error.message}`);
  if (app?.pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
  else app?.kill();
  process.exit(1);
}

const files = readdirSync(here).filter(name => name.endsWith('.test.mjs')).map(name => join(here, name));
const child = spawnSync(playwright ? (process.platform === 'win32' ? 'cmd.exe' : 'pnpm') : process.execPath,
  playwright ? (process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm exec playwright test tests/e2e/security-auth.spec.mjs'] : ['exec', 'playwright', 'test', 'tests/e2e/security-auth.spec.mjs']) : ['--test', ...files], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env,
});
if (app?.pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' });
else app?.kill();
process.exit(child.status ?? 1);
