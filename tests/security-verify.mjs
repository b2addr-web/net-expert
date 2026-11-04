import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const local = ['55431', '56431', '57431'];
const unsafe = Object.entries(process.env).filter(([name, value]) =>
  /SUPABASE.*(URL|DB_URL)/i.test(name) && value && !local.some(port => value.includes(`127.0.0.1:${port}`)) && !value.includes('localhost:'));
if (unsafe.length) {
  console.error('SECURITY GATE BLOCKED: nonlocal Supabase environment variable detected. Names:', unsafe.map(([name]) => name).join(', '));
  process.exit(1);
}

const checks = [
  ['rls-policy-upgrade-comparison', ['node', 'tests/phase4g-clean/compare-policies.mjs', '--verify']],
  ['grant-baseline', ['node', 'tests/phase4h/compare-privileges.mjs', '--phase4h', '--after']],
  ['local-auth-storage-api', ['node', 'tests/local-supabase/run-local.mjs']],
  ['local-cron-rls', ['node', 'tests/local-supabase/run-local.mjs', '--phase4h']],
  ['real-browser-auth', ['node', 'tests/local-supabase/run-local.mjs', '--playwright']],
  ['node-tests', ['pnpm', 'test:node']],
  ['isolated-playwright', ['pnpm', 'exec', 'playwright', 'test', 'tests/e2e/tooling.spec.mjs', 'tests/e2e/xss.spec.mjs']],
  ['eslint', ['pnpm', 'lint']],
  ['production-build', ['pnpm', 'build']],
  ['dependency-audit', ['pnpm', 'audit', '--audit-level', 'moderate']],
];
const results = [];
for (const [name, command] of checks) {
  console.log(`SECURITY GATE: ${name}`);
  const [program, ...args] = command;
  const result = spawnSync(process.platform === 'win32' && program === 'pnpm' ? 'cmd.exe' : program,
    process.platform === 'win32' && program === 'pnpm' ? ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] : args,
    { stdio: 'inherit', windowsHide: true, timeout: 240000, env: process.env });
  const status = result.status === 0 ? 'PASS' : result.error?.code === 'ETIMEDOUT' ? 'BLOCKED' : 'FAIL';
  results.push({ name, status, exitCode: result.status, reason: result.error?.code || null });
}
const ready = results.every(row => row.status === 'PASS');
writeFileSync('security-verification-results.json', JSON.stringify({ ready, results }, null, 2));
console.log(`SECURITY GATE RESULT: ${ready ? 'PASS' : 'NOT READY'}; see security-verification-results.json`);
process.exitCode = ready ? 0 : 1;
