import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStagingKeys, parseStagingKeys, stagingRef, stagingUrl } from './staging-supabase-keys.mjs';

const jwt = (ref, role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.fixture`;
const legacy = { anon: jwt(stagingRef, 'anon'), service: jwt(stagingRef, 'service_role') };
const modern = { anon: 'sb_publishable_fixture_only', service: 'sb_secret_fixture_only_12345' };
const output = (keys = legacy) => [{ name: 'anon', api_key: keys.anon }, { name: 'service_role', api_key: keys.service }];
const never = () => assert.fail('CLI should not be called');

test('reads legacy arrays and current wrapped JSON key responses', () => {
  assert.deepEqual(parseStagingKeys(JSON.stringify(output())), legacy);
  const wrapped = { result: { keys: [{ value: modern.anon }, { key: modern.service }] } };
  assert.deepEqual(parseStagingKeys(JSON.stringify(wrapped)), modern);
});

test('rejects masked server keys and JWT keys for another project', () => {
  assert.equal(parseStagingKeys(JSON.stringify(output({ ...modern, service: 'sb_secret_...12345' }))), null);
  assert.equal(parseStagingKeys(JSON.stringify(output({ ...legacy, service: jwt('different-project', 'service_role') }))), null);
  assert.equal(parseStagingKeys('non-JSON diagnostic'), null);
});

test('prefers a complete explicit Staging environment pair', () => {
  assert.deepEqual(loadStagingKeys({
    STAGING_SUPABASE_PUBLISHABLE_KEY: modern.anon, STAGING_SUPABASE_SECRET_KEY: modern.service,
  }, never), modern);
  assert.throws(() => loadStagingKeys({ STAGING_SUPABASE_SECRET_KEY: modern.service }, never), /valid public and server key pair/);
});

test('uses generic environment keys only when their configured URLs match Staging', () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: stagingUrl + '/', NEXT_PUBLIC_SUPABASE_ANON_KEY: legacy.anon, SUPABASE_SERVICE_ROLE_KEY: legacy.service };
  assert.deepEqual(loadStagingKeys(env, never), legacy);
  assert.throws(() => loadStagingKeys({ ...env, SUPABASE_URL: 'https://other.supabase.co' }, () => ({ status: 1 })), /CLI access failed/);
});

test('uses the working system CLI and falls back across JSON flags and the pinned CLI', () => {
  const calls = [];
  const keys = loadStagingKeys({}, command => {
    calls.push(command);
    if (command.startsWith('pnpm exec ') && command.endsWith('--output-format json')) {
      return { status: 0, stdout: JSON.stringify({ data: output() }) };
    }
    return { status: 1 };
  });
  assert.deepEqual(keys, legacy);
  assert.match(calls[0], /^supabase .* --output json$/);
  assert.ok(calls.every(command => command.includes(`--project-ref ${stagingRef}`)));
});

test('does not pass raw CLI output or errors to the caller', () => {
  assert.throws(() => loadStagingKeys({}, () => ({ status: 0, stdout: 'fixture-secret', stderr: 'fixture-secret' })),
    { message: 'Supabase CLI returned no usable Staging key pair' });
});
