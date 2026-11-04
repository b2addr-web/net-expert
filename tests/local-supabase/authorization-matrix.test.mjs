import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const anon = process.env.SUPABASE_LOCAL_ANON_KEY;
const service = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
const enabled = process.env.RUN_LOCAL_SUPABASE_TESTS === '1' && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(url || '');
const suffix = randomUUID().slice(0, 8);
const password = `Matrix-${randomUUID()}!`;
const state = { admin: null, org: null, users: {}, clients: {}, rows: {} };

function guard(t) { if (!enabled) { t.skip('Local Supabase only'); return true; } assert.ok(anon && service); return false; }
async function signIn(label) {
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await client.auth.signInWithPassword({ email: state.users[label].email, password })).error);
  state.clients[label] = client;
}

before(async (t) => {
  if (guard(t)) return;
  state.admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const label of ['admin', 'operator', 'viewer', 'other']) {
    const { data, error } = await state.admin.auth.admin.createUser({ email: `matrix-${label}-${suffix}@example.test`, password, email_confirm: true });
    assert.ifError(error); state.users[label] = data.user;
  }
  const { data: orgs, error } = await state.admin.from('organizations').insert([
    { name: `Matrix A ${suffix}`, slug: `matrix-a-${suffix}`, created_by: state.users.admin.id },
    { name: `Matrix B ${suffix}`, slug: `matrix-b-${suffix}`, created_by: state.users.other.id },
  ]).select('id,name');
  assert.ifError(error); state.org = orgs.find(o => o.name.startsWith('Matrix A')).id;
  const orgB = orgs.find(o => o.name.startsWith('Matrix B')).id;
  assert.ifError((await state.admin.from('organization_members').upsert([
    { organization_id: state.org, user_id: state.users.admin.id, role: 'company_admin', status: 'active' },
    { organization_id: state.org, user_id: state.users.operator.id, role: 'operator', status: 'active' },
    { organization_id: state.org, user_id: state.users.viewer.id, role: 'viewer', status: 'active' },
    { organization_id: orgB, user_id: state.users.other.id, role: 'company_admin', status: 'active' },
  ])).error);
  assert.ifError((await state.admin.from('member_permissions').upsert([
    { organization_id: state.org, user_id: state.users.operator.id, section: 'reports', allowed: true },
    { organization_id: state.org, user_id: state.users.operator.id, section: 'purchasing', allowed: true },
  ])).error);
  assert.ifError((await state.admin.from('user_workspace_preferences').upsert([
    { user_id: state.users.admin.id, organization_id: state.org },
    { user_id: state.users.operator.id, organization_id: state.org },
    { user_id: state.users.viewer.id, organization_id: state.org },
    { user_id: state.users.other.id, organization_id: orgB },
  ])).error);
  const seeded = await state.admin.from('assets').insert({ organization_id: state.org, description: `matrix asset ${suffix}` }).select('id').single();
  assert.ifError(seeded.error); state.rows.asset = seeded.data.id;
  const expense = await state.admin.from('expenses').insert({ organization_id: state.org, description: `matrix expense ${suffix}` }).select('id').single();
  assert.ifError(expense.error); state.rows.expense = expense.data.id;
  for (const label of ['admin', 'operator', 'viewer', 'other']) await signIn(label);
});

test('viewer cannot write assets or expenses, and cannot change existing rows', async (t) => {
  if (guard(t)) return;
  const viewer = state.clients.viewer;
  const insert = await viewer.from('assets').insert({ organization_id: state.org, description: `viewer asset ${suffix}` });
  assert.ok(insert.error || !insert.data?.length);
  const update = await viewer.from('expenses').update({ description: 'viewer changed' }).eq('id', state.rows.expense).select('id');
  assert.ok(update.error || !update.data?.length);
  const after = await state.admin.from('expenses').select('description').eq('id', state.rows.expense).single();
  assert.ifError(after.error); assert.notEqual(after.data.description, 'viewer changed');
});

test('operator with explicit reports/assets permissions can write its tenant rows', async (t) => {
  if (guard(t)) return;
  const operator = state.clients.operator;
  const inserted = await operator.from('assets').insert({ organization_id: state.org, description: `operator asset ${suffix}` }).select('id').single();
  assert.ifError(inserted.error);
  const updated = await operator.from('expenses').update({ description: 'operator changed' }).eq('id', state.rows.expense).select('id').single();
  assert.ifError(updated.error);
});

test('other company cannot read or delete tenant rows', async (t) => {
  if (guard(t)) return;
  const other = state.clients.other;
  const read = await other.from('assets').select('id').eq('id', state.rows.asset);
  assert.ifError(read.error); assert.deepEqual(read.data, []);
  const del = await other.from('assets').delete().eq('id', state.rows.asset).select('id');
  assert.ok(del.error || !del.data?.length);
});

test('contracts require explicit access and enforce tenant and write roles', async (t) => {
  if (guard(t)) return;
  const title = `matrix contract ${suffix}`;
  const seeded = await state.admin.from('contracts').insert({ organization_id: state.org, title, vendor: 'Test vendor' }).select('id').single();
  assert.ifError(seeded.error);
  const id = seeded.data.id;
  const adminRead = await state.clients.admin.from('contracts').select('id').eq('id', id);
  assert.ifError(adminRead.error); assert.equal(adminRead.data.length, 1);
  for (const label of ['operator', 'viewer', 'other']) {
    const read = await state.clients[label].from('contracts').select('id').eq('id', id);
    assert.ifError(read.error); assert.deepEqual(read.data, []);
    const changed = await state.clients[label].from('contracts').update({ title: 'unauthorized change' }).eq('id', id).select('id');
    assert.ok(changed.error || !changed.data?.length);
    const removed = await state.clients[label].from('contracts').delete().eq('id', id).select('id');
    assert.ok(removed.error || !removed.data?.length);
  }
  const deniedInsert = await state.clients.viewer.from('contracts').insert({ organization_id: state.org, title: 'viewer denied' }).select('id');
  assert.ok(deniedInsert.error || !deniedInsert.data?.length);
  const persisted = await state.admin.from('contracts').select('title').eq('id', id).single();
  assert.ifError(persisted.error); assert.equal(persisted.data.title, title);
  assert.ifError((await state.admin.from('member_permissions').upsert({ organization_id: state.org, user_id: state.users.viewer.id, section: 'contracts', allowed: true })).error);
  const viewerRead = await state.clients.viewer.from('contracts').select('id').eq('id', id);
  assert.ifError(viewerRead.error); assert.equal(viewerRead.data.length, 1);
  const viewerWrite = await state.clients.viewer.from('contracts').update({ title: 'viewer write denied' }).eq('id', id).select('id');
  assert.ok(viewerWrite.error || !viewerWrite.data?.length);
  assert.ifError((await state.admin.from('member_permissions').upsert({ organization_id: state.org, user_id: state.users.operator.id, section: 'contracts', allowed: true })).error);
  const allowedInsert = await state.clients.operator.from('contracts').insert({ organization_id: state.org, title: 'operator contract' }).select('id').single();
  assert.ifError(allowedInsert.error);
  const allowedUpdate = await state.clients.operator.from('contracts').update({ title: 'operator updated' }).eq('id', allowedInsert.data.id).select('title').single();
  assert.ifError(allowedUpdate.error); assert.equal(allowedUpdate.data.title, 'operator updated');
  const allowedDelete = await state.clients.operator.from('contracts').delete().eq('id', allowedInsert.data.id).select('id').single();
  assert.ifError(allowedDelete.error);
});

after(async () => {
  if (!state.admin) return;
  if (state.org) await state.admin.from('organizations').delete().eq('id', state.org);
  for (const user of Object.values(state.users)) await state.admin.auth.admin.deleteUser(user.id);
});
