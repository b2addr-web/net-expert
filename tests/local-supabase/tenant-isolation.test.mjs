import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const enabled = process.env.RUN_LOCAL_SUPABASE_TESTS === '1';
const isLocal = (() => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  } catch { return false; }
})();

const suffix = randomUUID().slice(0, 8);
const password = `LocalOnly-${randomUUID()}!`;
const state = { users: {}, orgs: {}, devices: {}, admin: null, clients: {} };

function skipUnlessLocal(t) {
  if (!enabled) {
    t.skip('Set RUN_LOCAL_SUPABASE_TESTS=1 after Supabase starts locally. This suite never accepts a remote target.');
    return true;
  }
  assert.equal(isLocal, true, 'SUPABASE_LOCAL_URL must be an http loopback address.');
  assert.ok(anonKey?.length > 20, 'A local anon key is required.');
  assert.ok(serviceKey?.length > 20, 'A local service-role key is required.');
  return false;
}

async function createUser(label) {
  const email = `phase4-${label}-${suffix}@example.test`;
  const { data, error } = await state.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  state.users[label] = data.user;
}

async function signedIn(label) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: state.users[label].email, password });
  assert.ifError(error);
  state.clients[label] = client;
}

before(async (t) => {
  if (skipUnlessLocal(t)) return;
  state.admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const label of ['adminA', 'operatorA', 'viewerA', 'adminB']) await createUser(label);

  const { data: organizations, error: organizationError } = await state.admin
    .from('organizations')
    .insert([
      { name: 'Test Organization A', slug: `phase4-a-${suffix}`, created_by: state.users.adminA.id },
      { name: 'Test Organization B', slug: `phase4-b-${suffix}`, created_by: state.users.adminB.id },
    ])
    .select('id,name');
  assert.ifError(organizationError);
  state.orgs.a = organizations.find((row) => row.name === 'Test Organization A').id;
  state.orgs.b = organizations.find((row) => row.name === 'Test Organization B').id;

  const memberships = [
    ['adminA', state.orgs.a, 'company_admin'], ['operatorA', state.orgs.a, 'operator'],
    ['viewerA', state.orgs.a, 'viewer'], ['adminB', state.orgs.b, 'company_admin'],
  ].map(([label, organization_id, role]) => ({ organization_id, user_id: state.users[label].id, role, status: 'active' }));
  assert.ifError((await state.admin.from('organization_members').upsert(memberships)).error);
  assert.ifError((await state.admin.from('user_workspace_preferences').upsert([
    { user_id: state.users.adminA.id, organization_id: state.orgs.a },
    { user_id: state.users.operatorA.id, organization_id: state.orgs.a },
    { user_id: state.users.viewerA.id, organization_id: state.orgs.a },
    { user_id: state.users.adminB.id, organization_id: state.orgs.b },
  ])).error);
  const { data: devices, error: deviceError } = await state.admin.from('devices').insert([
    { name: `Phase4 device A ${suffix}`, status: 'Active', organization_id: state.orgs.a },
    { name: `Phase4 device B ${suffix}`, status: 'Active', organization_id: state.orgs.b },
  ]).select('id,organization_id');
  assert.ifError(deviceError);
  state.devices.a = devices.find((row) => row.organization_id === state.orgs.a).id;
  state.devices.b = devices.find((row) => row.organization_id === state.orgs.b).id;
  for (const label of Object.keys(state.users)) await signedIn(label);
});

test('Admin A cannot read Organization B devices', async (t) => {
  if (skipUnlessLocal(t)) return;
  const { data, error } = await state.clients.adminA.from('devices').select('id').eq('id', state.devices.b);
  assert.ifError(error);
  assert.deepEqual(data, []);
});

test('Operator A cannot insert a device for Organization B', async (t) => {
  if (skipUnlessLocal(t)) return;
  const { data, error } = await state.clients.operatorA.from('devices').insert({ name: 'cross-tenant write', organization_id: state.orgs.b }).select('id');
  assert.ok(error || data.length === 0, 'cross-tenant insert must be denied by grants or RLS');
});

test('Viewer A cannot write a device in Organization A (legacy devices-policy regression test)', async (t) => {
  if (skipUnlessLocal(t)) return;
  const name = `viewer write must fail ${suffix}`;
  const { error } = await state.clients.viewerA.from('devices').insert({ name, status: 'Active', organization_id: state.orgs.a });
  const { data: rows, error: verifyError } = await state.admin.from('devices').select('id').eq('name', name);
  assert.ifError(verifyError);
  assert.equal(rows.length, 0, 'viewer write succeeded: apply and verify the reviewed workspace_write policy migration locally');
  assert.ok(error || rows.length === 0);
});

test('Viewer A cannot grant itself administrator permissions', async (t) => {
  if (skipUnlessLocal(t)) return;
  const { data, error } = await state.clients.viewerA.from('member_permissions').upsert({
    organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'administration', allowed: true,
  }).select('allowed');
  assert.ok(error || data.length === 0, 'viewer self-escalation must be denied');
});

test('Operator A cannot move an Organization B device into Organization A', async (t) => {
  if (skipUnlessLocal(t)) return;
  const { data, error } = await state.clients.operatorA.from('devices').update({ organization_id: state.orgs.a }).eq('id', state.devices.b).select('id');
  assert.ok(error || data.length === 0, 'cross-tenant update must be denied');
});

test('Viewer A cannot read a private file stored under Organization B', async (t) => {
  if (skipUnlessLocal(t)) return;
  const path = `${state.orgs.b}/knowledge/${suffix}/private.txt`;
  assert.ifError((await state.admin.storage.from('knowledge-files').upload(path, new Blob(['phase4 local only'], { type: 'text/plain' }), { contentType: 'text/plain', upsert: false })).error);
  const { data, error } = await state.clients.viewerA.storage.from('knowledge-files').download(path);
  assert.ok(error || data === null, 'cross-tenant storage read must be denied');
});

test('workspace Storage permits scoped upload and download but rejects viewer and cross-tenant mutations', async (t) => {
  if (skipUnlessLocal(t)) return;
  const path = `${state.orgs.a}/assets/${suffix}/workspace.txt`;
  const foreign = `${state.orgs.b}/assets/${suffix}/forged.txt`;
  const file = () => new Blob(['phase4g local storage fixture'], { type: 'text/plain' });
  assert.ifError((await state.clients.operatorA.storage.from('workspace-files').upload(path, file(), { contentType: 'text/plain' })).error);
  const read = await state.clients.viewerA.storage.from('workspace-files').download(path);
  assert.ifError(read.error); assert.equal(await read.data.text(), 'phase4g local storage fixture');
  const foreignRead = await state.clients.adminB.storage.from('workspace-files').download(path);
  assert.ok(foreignRead.error || foreignRead.data === null);
  const viewerUpload = await state.clients.viewerA.storage.from('workspace-files').upload(`${state.orgs.a}/assets/${suffix}/viewer.txt`, file(), { contentType: 'text/plain' });
  assert.ok(viewerUpload.error, 'viewer upload must be rejected');
  const foreignUpload = await state.clients.operatorA.storage.from('workspace-files').upload(foreign, file(), { contentType: 'text/plain' });
  assert.ok(foreignUpload.error, 'cross-tenant upload must be rejected');
  const foreignDelete = await state.clients.adminB.storage.from('workspace-files').remove([path]);
  assert.ok(foreignDelete.error || !foreignDelete.data?.length, 'cross-tenant delete must be rejected');
});

test('Local Auth rejects a wrong password and signs out the test user', async (t) => {
  if (skipUnlessLocal(t)) return;
  const wrong = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const failedLogin = await wrong.auth.signInWithPassword({ email: state.users.viewerA.email, password: 'definitely-not-the-test-password' });
  assert.ok(failedLogin.error, 'a wrong password must be rejected');
  const previous = await state.clients.viewerA.auth.getSession();
  assert.ok(previous.data.session?.refresh_token);
  assert.ifError((await state.clients.viewerA.auth.signOut({ scope: 'local' })).error);
  const { data } = await state.clients.viewerA.auth.getUser();
  assert.equal(data.user, null, 'sign-out must clear the local session');
  const replayClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const replay = await replayClient.auth.refreshSession({ refresh_token: previous.data.session.refresh_token });
  assert.ok(replay.error || !replay.data.session, 'a signed-out refresh token must not restore the session');
});

after(async () => {
  if (!enabled || !isLocal || !state.admin) return;
  await state.admin.storage.from('workspace-files').remove([`${state.orgs.a}/assets/${suffix}/workspace.txt`]);
  await state.admin.storage.from('knowledge-files').remove([`${state.orgs.b}/knowledge/${suffix}/private.txt`]);
  await state.admin.from('organizations').delete().in('id', [state.orgs.a, state.orgs.b]);
  for (const user of Object.values(state.users)) await state.admin.auth.admin.deleteUser(user.id);
});
