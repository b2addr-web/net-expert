import test from 'node:test';
import assert from 'node:assert/strict';

const appUrl = process.env.NETEXPERT_LOCAL_APP_URL;

function localApp(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch { return false; }
}

test('local API rejects unauthenticated administration and platform requests', async (t) => {
  if (!process.env.RUN_LOCAL_SUPABASE_TESTS || !appUrl) {
    t.skip('Set RUN_LOCAL_SUPABASE_TESTS=1 and NETEXPERT_LOCAL_APP_URL after starting Next.js locally.');
    return;
  }
  assert.equal(localApp(appUrl), true, 'NETEXPERT_LOCAL_APP_URL must be a loopback HTTP address.');
  const requests = ['/api/intake/admin', '/api/platform/inventory', '/api/organization/users'];
  for (const path of requests) {
    const response = await fetch(new URL(path, appUrl));
    assert.ok([401, 403, 405].includes(response.status), `${path} unexpectedly returned ${response.status}`);
  }
});
