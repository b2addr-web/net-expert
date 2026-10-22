import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('password recovery verifies the branded confirmation link before password update',async()=>{
  const [auth,confirm,page,headers]=await Promise.all([read('../components/AuthContext.js'),read('../pages/auth/confirm.js'),read('../pages/reset-password.js'),read('../next.config.js')]);
  assert.match(auth,/redirectUrl\('\/reset-password'\)/);
  assert.match(auth,/verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
  assert.match(auth,/\['recovery', 'invite'\]\.includes\(type\)/);
  assert.match(auth,/readRecoveryGrant\(\) !== authUser\.id/);
  assert.match(confirm,/window\.history\.replaceState/);
  assert.match(confirm,/router\.replace\('\/reset-password'\)/);
  assert.match(confirm,/tokenType\.current = type/);
  assert.match(headers,/source: '\/auth\/confirm'/);
  assert.match(page,/initialMode="newPassword"/);
});

test('browser Supabase configuration contains no server credential',async()=>{
  const source=await read('../lib/supabase.js');
  assert.match(source,/sb_publishable_/);
  assert.doesNotMatch(source,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role/);
  assert.match(source,/isSupabaseConfigured/);
});

test('member removal does not delete the global auth identity',async()=>{
  const [api,migration]=await Promise.all([read('../pages/api/organization/users.js'),read('../supabase-security-hardening.sql')]);
  assert.doesNotMatch(api,/admin\.deleteUser/);
  assert.match(api,/admin_remove_member/);
  assert.match(migration,/delete from organization_members/);
});

test('spreadsheet export neutralizes formula prefixes',async()=>{
  const source=await read('../lib/export.js');
  assert.match(source,/\^\[=\+\\-@\\t\\r\]/);
  assert.doesNotMatch(source,/from 'xlsx'/);
});

test('profile repair is bounded and stale auth loads cannot restore a signed-out user',async()=>{
  const source=await read('../components/AuthContext.js');
  assert.match(source,/if \(repairAttempted\) throw new Error\('PROFILE_MISSING_AFTER_REPAIR'\)/);
  assert.match(source,/return loadProfile\(authUser, 0, true\)/);
  assert.match(source,/const revision = \+\+authRevision/);
  assert.match(source,/active && revision === authRevision/);
});

test('intake email has a finite network timeout',async()=>{
  const source=await read('../lib/intake-server.js');
  assert.match(source,/signal:AbortSignal\.timeout\(8000\)/);
});
