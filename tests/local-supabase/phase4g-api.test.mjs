import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_LOCAL_URL;
const app = process.env.NETEXPERT_LOCAL_APP_URL;
const enabled = process.env.RUN_LOCAL_SUPABASE_TESTS === '1' && /^http:\/\/127\.0\.0\.1:(55431|56431|57431)$/.test(url || '') && /^http:\/\/127\.0\.0\.1:(3013|3014|3015)$/.test(app || '');
const suffix = randomUUID().slice(0, 8);
const password = `Phase4G-${randomUUID()}!`;
const state = { users: {}, clients: {}, tokens: {}, orgs: {}, items: {} };
let service;

function guard(t) { if (!enabled) { t.skip('Requires the isolated local Auth and Next.js services'); return true; } return false; }
async function api(path, label, method = 'GET', body) {
  const response = await fetch(new URL(path, app), {
    method,
    headers: { ...(label ? { Authorization: `Bearer ${state.tokens[label]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

before(async (t) => {
  if (guard(t)) return;
  service = createClient(url, process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const label of ['adminA', 'managerA', 'operatorA', 'viewerA', 'suspendedA', 'adminB']) {
    const result = await service.auth.admin.createUser({ email: `phase4g-${label}-${suffix}@example.test`, password, email_confirm: true });
    assert.ifError(result.error); state.users[label] = result.data.user;
  }
  const organizations = await service.from('organizations').insert([
    { name: `Security Test Company A ${suffix}`, slug: `phase4g-a-${suffix}`, created_by: state.users.adminA.id },
    { name: `Security Test Company B ${suffix}`, slug: `phase4g-b-${suffix}`, created_by: state.users.adminB.id },
  ]).select('id,slug');
  assert.ifError(organizations.error);
  state.orgs.a = organizations.data.find(row => row.slug.startsWith('phase4g-a-')).id;
  state.orgs.b = organizations.data.find(row => row.slug.startsWith('phase4g-b-')).id;
  const roles = { adminA: 'company_admin', managerA: 'manager', operatorA: 'operator', viewerA: 'viewer', suspendedA: 'viewer', adminB: 'company_admin' };
  assert.ifError((await service.from('organization_members').upsert(Object.entries(roles).map(([label, role]) => ({ organization_id: label === 'adminB' ? state.orgs.b : state.orgs.a, user_id: state.users[label].id, role, status: 'active' })))).error);
  assert.ifError((await service.from('user_workspace_preferences').upsert(Object.keys(roles).map(label => ({ user_id: state.users[label].id, organization_id: label === 'adminB' ? state.orgs.b : state.orgs.a })))).error);
  assert.ifError((await service.from('member_permissions').upsert([
    { organization_id: state.orgs.a, user_id: state.users.operatorA.id, section: 'inventory', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'inventory', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.suspendedA.id, section: 'inventory', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.managerA.id, section: 'subscriptions', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.operatorA.id, section: 'purchasing', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'purchasing', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.operatorA.id, section: 'reports', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'reports', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.operatorA.id, section: 'exports', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'exports', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.operatorA.id, section: 'notes', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'notes', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'subscriptions', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'monitoring', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.viewerA.id, section: 'report', allowed: true },
    { organization_id: state.orgs.a, user_id: state.users.operatorA.id, section: 'report', allowed: true },
  ])).error);
  const items = await service.from('inventory_items').insert([
    { organization_id: state.orgs.a, name: `A item ${suffix}`, category: 'Test', brand: 'Test', quantity: 1 },
    { organization_id: state.orgs.b, name: `B item ${suffix}`, category: 'Test', brand: 'Test', quantity: 1 },
  ]).select('id,organization_id,name');
  assert.ifError(items.error);
  state.items.a = items.data.find(row => row.organization_id === state.orgs.a);
  state.items.b = items.data.find(row => row.organization_id === state.orgs.b);
  for (const table of ['purchases', 'expenses', 'assets']) {
    const seeded = await service.from(table).insert({ organization_id: state.orgs.a, description: `Phase4G ${table} ${suffix}` }).select('id').single();
    assert.ifError(seeded.error); state.items[table] = seeded.data.id;
  }
  for (const label of Object.keys(roles)) {
    const client = createClient(url, process.env.SUPABASE_LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email: state.users[label].email, password });
    assert.ifError(signed.error); state.clients[label] = client; state.tokens[label] = signed.data.session.access_token;
  }
  const note = await state.clients.adminA.from('knowledge_items').insert({ organization_id: state.orgs.a, title: `Phase4G note ${suffix}`, body: 'نص اختباري', shared_with_team: true }).select('id').single();
  assert.ifError(note.error); state.items.note = note.data.id;
  const exportRow = await service.from('export_history').insert({ organization_id: state.orgs.a, exported_by: state.users.adminA.id, file_name: `phase4g-${suffix}.csv`, file_type: 'csv', source: 'assets' }).select('id').single();
  assert.ifError(exportRow.error); state.items.export = exportRow.data.id;
  const subscription = await service.from('service_subscriptions').insert({ organization_id: state.orgs.a, name: `Phase4G subscription ${suffix}`, provider: 'Test', start_date: '2026-01-01', end_date: '2026-12-31', cost: 0, billing_cycle: 'yearly' }).select('id').single();
  assert.ifError(subscription.error); state.items.subscription = subscription.data.id;
  const monitor = await service.from('monitor_sites').insert({ organization_id: state.orgs.a, name: `Phase4G disabled site ${suffix}`, url: 'https://example.test', domain_name: 'example.test', enabled: false }).select('id').single();
  assert.ifError(monitor.error); state.items.monitor = monitor.data.id;
  const cases = await service.from('intake_cases').insert([state.orgs.a, state.orgs.b].map((organization_id, index) => ({
    organization_id, kind: 'report', reference: `PHASE4G-${suffix}-${index}`, employee_name: 'Test Employee', employee_number: `T${index}`,
    email: `phase4g-case-${index}-${suffix}@example.test`, department: 'Test', issue_type: 'Test issue', description: 'Local-only test case', status: 'جديد',
  }))).select('id,organization_id');
  assert.ifError(cases.error);
  state.items.caseA = cases.data.find(row => row.organization_id === state.orgs.a).id;
  state.items.caseB = cases.data.find(row => row.organization_id === state.orgs.b).id;
  assert.ifError((await service.from('organization_members').update({ status: 'suspended' }).eq('organization_id', state.orgs.a).eq('user_id', state.users.suspendedA.id)).error);
});

test('API scopes privileged inventory reads to the authenticated company', async (t) => {
  if (guard(t)) return;
  const a = await api('/api/platform/inventory', 'adminA');
  const b = await api('/api/platform/inventory', 'adminB');
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.ok(a.body.items.some(row => row.id === state.items.a.id));
  assert.ok(!a.body.items.some(row => row.id === state.items.b.id));
  assert.ok(b.body.items.some(row => row.id === state.items.b.id));
  assert.ok(!b.body.items.some(row => row.id === state.items.a.id));
});

test('API enforces viewer and manager permissions and validates writes', async (t) => {
  if (guard(t)) return;
  assert.equal((await api('/api/platform/inventory', 'viewerA')).status, 200);
  assert.equal((await api('/api/platform/inventory', 'managerA')).status, 403);
  assert.equal((await api('/api/platform/subscriptions', 'managerA')).status, 200);
  const payload = { name: `API item ${suffix}`, category: 'Test', brand: 'Test', quantity: 2, min_quantity: 0 };
  assert.equal((await api('/api/platform/inventory', 'viewerA', 'POST', payload)).status, 403);
  assert.equal((await api('/api/platform/inventory', 'adminA', 'POST', { name: '' })).status, 400);
  const created = await api('/api/platform/inventory', 'operatorA', 'POST', payload);
  assert.equal(created.status, 201);
  assert.equal(created.body.item.organization_id, state.orgs.a);
});

test('API rejects cross-company identifiers and invalid sessions', async (t) => {
  if (guard(t)) return;
  const wrong = await api('/api/platform/inventory', 'operatorA', 'DELETE', { id: state.items.b.id });
  assert.equal(wrong.status, 404);
  const after = await service.from('inventory_items').select('id').eq('id', state.items.b.id).single();
  assert.ifError(after.error);
  assert.equal((await api('/api/platform/inventory', null)).status, 403);
  const invalid = await fetch(new URL('/api/platform/inventory', app), { headers: { Authorization: 'Bearer invalid-local-token' } });
  assert.equal(invalid.status, 403);
  assert.equal((await api('/api/organization/users', 'viewerA', 'DELETE', { userId: state.users.adminA.id })).status, 403);
  assert.equal((await api('/api/organization/users', 'adminA', 'DELETE', { userId: state.users.adminB.id })).status, 404);
});

test('revoked section access takes effect on the next request with the same Auth session', async (t) => {
  if (guard(t)) return;
  assert.equal((await api('/api/platform/inventory', 'viewerA')).status, 200);
  try {
    const revoked = await service.from('member_permissions').update({ allowed: false })
      .eq('organization_id', state.orgs.a).eq('user_id', state.users.viewerA.id).eq('section', 'inventory');
    assert.ifError(revoked.error);
    assert.equal((await api('/api/platform/inventory', 'viewerA')).status, 403);
    const direct = await state.clients.viewerA.from('inventory_items').select('id').eq('id', state.items.a.id);
    assert.ifError(direct.error); assert.deepEqual(direct.data, []);
  } finally {
    const restored = await service.from('member_permissions').update({ allowed: true })
      .eq('organization_id', state.orgs.a).eq('user_id', state.users.viewerA.id).eq('section', 'inventory');
    assert.ifError(restored.error);
  }
  assert.equal((await api('/api/platform/inventory', 'viewerA')).status, 200);
});

test('operator cannot move an inventory row to a foreign organization', async (t) => {
  if (guard(t)) return;
  const attempt = await state.clients.operatorA.from('inventory_items')
    .update({ organization_id: state.orgs.b }).eq('id', state.items.a.id).select('id');
  assert.ok(attempt.error || !attempt.data?.length, 'cross-tenant organization_id update succeeded');
  const unchanged = await service.from('inventory_items').select('organization_id').eq('id', state.items.a.id).single();
  assert.ifError(unchanged.error); assert.equal(unchanged.data.organization_id, state.orgs.a);
});

test('intake administration API scopes reports and note writes to company and role', async (t) => {
  if (guard(t)) return;
  const admin = await api('/api/intake/admin?kind=report', 'adminA');
  assert.equal(admin.status, 200);
  assert.ok(admin.body.cases.some(row => row.id === state.items.caseA));
  assert.ok(!admin.body.cases.some(row => row.id === state.items.caseB));
  const other = await api('/api/intake/admin?kind=report', 'adminB');
  assert.equal(other.status, 200);
  assert.ok(other.body.cases.some(row => row.id === state.items.caseB));
  assert.ok(!other.body.cases.some(row => row.id === state.items.caseA));
  assert.equal((await api('/api/intake/admin?kind=report', 'viewerA')).status, 200);
  assert.equal((await api('/api/intake/admin', 'viewerA', 'POST', { action: 'note', caseId: state.items.caseA, note: 'Viewer denied' })).status, 403);
  assert.equal((await api('/api/intake/admin', 'operatorA', 'POST', { action: 'note', caseId: state.items.caseB, note: 'Cross-tenant denied' })).status, 404);
  assert.equal((await api('/api/intake/admin', 'operatorA', 'POST', { action: 'note', caseId: state.items.caseA, note: 'Local test note' })).status, 201);
});

test('suspended company membership cannot access its former company through API or RLS', async (t) => {
  if (guard(t)) return;
  const response = await api('/api/platform/inventory', 'suspendedA');
  assert.ok([200, 403].includes(response.status));
  if (response.status === 200) assert.ok(!response.body.items.some(row => row.id === state.items.a.id));
  const direct = await state.clients.suspendedA.from('inventory_items').select('id').eq('id', state.items.a.id);
  assert.ifError(direct.error); assert.deepEqual(direct.data, []);
});

test('financial tables separate authorized read from write across roles and tenants', async (t) => {
  if (guard(t)) return;
  for (const table of ['purchases', 'expenses', 'assets']) {
    const id = state.items[table];
    for (const label of ['adminA', 'viewerA']) {
      const read = await state.clients[label].from(table).select('id').eq('id', id);
      assert.ifError(read.error); assert.equal(read.data.length, 1, `${label} cannot read ${table}`);
    }
    const other = await state.clients.adminB.from(table).select('id').eq('id', id);
    assert.ifError(other.error); assert.deepEqual(other.data, []);
    const denied = await state.clients.viewerA.from(table).update({ description: 'viewer change' }).eq('id', id).select('id');
    assert.ok(denied.error || !denied.data?.length, `viewer modified ${table}`);
    const allowed = await state.clients.operatorA.from(table).update({ description: `operator ${table}` }).eq('id', id).select('id').single();
    assert.ifError(allowed.error);
  }
});

test('notes, subscriptions, monitoring and export history enforce scoped reads and viewer write denial', async (t) => {
  if (guard(t)) return;
  const cases = [['knowledge_items', 'note'], ['service_subscriptions', 'subscription'], ['monitor_sites', 'monitor'], ['export_history', 'export']];
  for (const [table, key] of cases) {
    const id = state.items[key];
    const own = await state.clients.viewerA.from(table).select('id').eq('id', id);
    assert.ifError(own.error); assert.equal(own.data.length, 1, `viewer cannot read ${table}`);
    const foreign = await state.clients.adminB.from(table).select('id').eq('id', id);
    assert.ifError(foreign.error); assert.deepEqual(foreign.data, []);
    const attempt = await state.clients.viewerA.from(table).delete().eq('id', id).select('id');
    assert.ok(attempt.error || !attempt.data?.length, `viewer deleted ${table}`);
  }
  const noteWrite = await state.clients.viewerA.from('knowledge_items').update({ body: 'viewer changed' }).eq('id', state.items.note).select('id');
  assert.ok(noteWrite.error || !noteWrite.data?.length);
});

test('knowledge Storage keeps linked note attachments protected from direct deletion', async (t) => {
  if (guard(t)) return;
  const path = `${state.orgs.a}/${state.users.adminA.id}/${suffix}/attachment.txt`;
  const content = 'phase4g attachment only';
  assert.ifError((await state.clients.adminA.storage.from('knowledge-files').upload(path, new Blob([content], { type: 'text/plain' }), { contentType: 'text/plain' })).error);
  const attached = await state.clients.adminA.from('knowledge_attachments').insert({ note_id: state.items.note, organization_id: state.orgs.a, created_by: state.users.adminA.id, file_path: path, file_name: 'attachment.txt', file_size: content.length, content_type: 'text/plain' }).select('id').single();
  assert.ifError(attached.error);
  const read = await state.clients.viewerA.storage.from('knowledge-files').download(path);
  assert.ifError(read.error); assert.equal(await read.data.text(), content);
  const foreign = await state.clients.adminB.storage.from('knowledge-files').download(path);
  assert.ok(foreign.error || foreign.data === null);
  const viewerUpload = await state.clients.viewerA.storage.from('knowledge-files').upload(`${state.orgs.a}/${state.users.viewerA.id}/${suffix}/viewer.txt`, new Blob([content], { type: 'text/plain' }), { contentType: 'text/plain' });
  assert.ok(viewerUpload.error, 'viewer uploaded to knowledge-files');
  const directDelete = await state.clients.adminA.storage.from('knowledge-files').remove([path]);
  assert.ok(directDelete.error || !directDelete.data?.length, 'linked attachment was deleted directly through Storage');
  const remains = await service.from('knowledge_attachments').select('id').eq('id', attached.data.id).single();
  assert.ifError(remains.error);
  const unlink = await state.clients.adminA.from('knowledge_attachments').delete().eq('id', attached.data.id).select('id').single();
  assert.ifError(unlink.error);
  const cleanup = await state.clients.adminA.storage.from('knowledge-files').remove([path]);
  assert.ifError(cleanup.error); assert.equal(cleanup.data?.length, 1, 'orphaned object cleanup failed after metadata removal');
});

test('SECURITY DEFINER RPCs reject unauthorized membership changes and cron token checks', async (t) => {
  if (guard(t)) return;
  const access = await state.clients.viewerA.rpc('get_my_access');
  assert.ifError(access.error); assert.equal(access.data.organization_id, state.orgs.a);
  const members = await state.clients.viewerA.rpc('list_organization_members');
  assert.ifError(members.error); assert.deepEqual(members.data, []);
  const escalation = await state.clients.viewerA.rpc('admin_update_member', { member_id: state.users.viewerA.id, new_role: 'company_admin', new_status: 'active', new_department: null, access: {} });
  assert.ok(escalation.error, 'viewer must not self-promote via SECURITY DEFINER RPC');
  const cronAnon = await createClient(url, process.env.SUPABASE_LOCAL_ANON_KEY, { auth: { persistSession: false } }).rpc('verify_platform_job_token', { candidate: 'invalid-local-token-with-adequate-length' });
  assert.ok(cronAnon.error, 'anon must not execute cron token verification');
  const cronService = await service.rpc('verify_platform_job_token', { candidate: 'invalid-local-token-with-adequate-length' });
  assert.ifError(cronService.error); assert.equal(cronService.data, false);
});

test('anon cannot read seeded tenant rows despite default table GRANT differences', async (t) => {
  if (guard(t)) return;
  const anon = createClient(url, process.env.SUPABASE_LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const cases = [['inventory_items', state.items.a.id], ['purchases', state.items.purchases], ['expenses', state.items.expenses], ['assets', state.items.assets], ['knowledge_items', state.items.note], ['export_history', state.items.export]];
  for (const [table, id] of cases) {
    const result = await anon.from(table).select('id').eq('id', id);
    assert.ok(result.error || !result.data?.length, `anon read ${table}`);
  }
});

test('local cron rejects invalid tokens and accepts the Vault token without external work', async (t) => {
  if (guard(t)) return;
  const container = process.env.LOCAL_CRON_CONTAINER;
  if (!['supabase_db_net-expert-security-phase4g-verify', 'supabase_db_net-expert-security-phase4h-fresh'].includes(container)) {
    t.skip('Cron execution is limited to the clean, isolated verification stack.'); return;
  }
  const activeSites = await service.from('monitor_sites').select('id').eq('enabled', true).limit(1);
  assert.ifError(activeSites.error);
  if (activeSites.data.length) { t.skip('Enabled sites exist; refusing to trigger external probes.'); return; }
  const invalid = await fetch(new URL('/api/jobs/platform?task=monitor', app), { headers: { 'x-platform-token': 'invalid-local-token-with-adequate-length' } });
  assert.equal(invalid.status, 403);
  const secretQuery = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', "select decrypted_secret from vault.decrypted_secrets where name='netexpert_platform_cron'"], { encoding: 'utf8', windowsHide: true });
  assert.equal(secretQuery.status, 0, 'local Vault query failed');
  const secret = secretQuery.stdout.trim();
  assert.match(secret, /^[a-f0-9]{64}$/);
  const run = () => fetch(new URL('/api/jobs/platform?task=monitor', app), { headers: { 'x-platform-token': secret } });
  const first = await run();
  assert.equal(first.status, 200);
  const [second, third] = await Promise.all([run(), run()]);
  assert.equal(second.status, 200); assert.equal(third.status, 200);
  const job = await service.from('platform_job_runs').select('task,status').eq('task', 'monitor').single();
  assert.ifError(job.error); assert.equal(job.data.status, 'success');
});

test('pg_cron schedules the isolated subscription job for two tenants without duplicate notification rows', async (t) => {
  if (guard(t)) return;
  const container = process.env.LOCAL_CRON_CONTAINER;
  if (container !== 'supabase_db_net-expert-security-phase4h-fresh') {
    t.skip('Actual scheduler execution is confined to the Phase 4H isolated stack.'); return;
  }
  const sql = statement => {
    const result = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', statement], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, 'local pg_cron setup or query failed');
    return result.stdout.trim();
  };
  assert.equal(sql("select extname from pg_extension where extname='pg_cron'"), 'pg_cron');
  const target = 'http://host.docker.internal:3015';
  if (sql("select exists(select 1 from vault.secrets where name='netexpert_platform_job_base_url')") === 'f') {
    sql(`select vault.create_secret('${target}','netexpert_platform_job_base_url','Local-only Phase 4H target')`);
  }
  assert.equal(sql(`select exists(select 1 from vault.decrypted_secrets where name='netexpert_platform_job_base_url' and decrypted_secret='${target}')`), 't');
  const endDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const rows = await service.from('service_subscriptions').insert([state.orgs.a, state.orgs.b].map((organization_id, index) => ({
    organization_id, name: `Phase4H scheduled ${index} ${suffix}`, provider: 'Local Test',
    start_date: '2026-01-01', end_date: endDate, cost: 0, billing_cycle: 'yearly',
  }))).select('id,organization_id');
  assert.ifError(rows.error);
  const scheduleName = `phase4h-subscriptions-${suffix}`;
  try {
    sql(`select cron.schedule('${scheduleName}','* * * * *','select private.invoke_netexpert_job(''subscriptions'')')`);
    let observed = [];
    for (let attempt = 0; attempt < 45; attempt++) {
      const result = await service.from('platform_notification_log').select('organization_id,resource_id,recipient_email,attempts')
        .in('resource_id', rows.data.map(row => row.id)).eq('kind', 'subscription');
      assert.ifError(result.error);
      observed = result.data || [];
      if (observed.length === 2) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(observed.length, 2, 'the scheduled job did not process both tenants');
    for (const row of rows.data) {
      const matches = observed.filter(log => log.resource_id === row.id);
      assert.equal(matches.length, 1, 'duplicate notification row');
      assert.equal(matches[0].organization_id, row.organization_id);
      assert.ok(matches[0].attempts >= 1 && matches[0].attempts <= 3);
    }
    const details = sql(`select status from cron.job_run_details where jobid=(select jobid from cron.job where jobname='${scheduleName}') order by runid desc limit 1`);
    assert.equal(details, 'succeeded', 'pg_cron did not execute the scheduled SQL');
  } finally {
    sql(`select cron.unschedule('${scheduleName}')`);
  }
});

test('monitor job leases two tenant sites and handles unsafe local-only targets without external probes', async (t) => {
  if (guard(t)) return;
  const container = process.env.LOCAL_CRON_CONTAINER;
  if (container !== 'supabase_db_net-expert-security-phase4h-fresh') {
    t.skip('Monitor worker test is confined to the Phase 4H isolated stack.'); return;
  }
  const sites = await service.from('monitor_sites').insert([state.orgs.a, state.orgs.b].map((organization_id, index) => ({
    organization_id, name: `Phase4H isolated site ${index} ${suffix}`,
    url: `https://phase4h-${index}-${suffix}.example.test/`, domain_name: `phase4h-${index}-${suffix}.example.test`,
    enabled: true, check_interval_minutes: 5,
  }))).select('id,organization_id');
  assert.ifError(sites.error);
  const tokenQuery = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', "select decrypted_secret from vault.decrypted_secrets where name='netexpert_platform_cron'"], { encoding: 'utf8', windowsHide: true });
  assert.equal(tokenQuery.status, 0);
  const token = tokenQuery.stdout.trim();
  assert.match(token, /^[a-f0-9]{64}$/);
  const request = () => fetch(new URL('/api/jobs/platform?task=monitor', app), { headers: { 'x-platform-token': token } });
  const [first, second] = await Promise.all([request(), request()]);
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const firstBody = await first.json(), secondBody = await second.json();
  assert.equal(firstBody.claimed + secondBody.claimed, 2, 'workers claimed a site more than once');
  const stored = await service.from('monitor_sites').select('id,organization_id,check_lease_until')
    .in('id', sites.data.map(site => site.id));
  assert.ifError(stored.error);
  assert.equal(stored.data.length, 2);
  for (const site of sites.data) {
    const actual = stored.data.find(row => row.id === site.id);
    assert.equal(actual.organization_id, site.organization_id);
    assert.ok(actual.check_lease_until, 'failed probe did not keep its retry lease');
  }
  const checks = await service.from('monitor_checks').select('id').in('site_id', sites.data.map(site => site.id));
  assert.ifError(checks.error); assert.equal(checks.data.length, 0, 'unsafe mock target was probed');
});

test('password recovery sends only to the local test mailbox', async (t) => {
  if (guard(t)) return;
  if (!process.env.LOCAL_MAIL_URL) { t.skip('The independent clean stack does not include a local mail service.'); return; }
  const reset = await state.clients.viewerA.auth.resetPasswordForEmail(state.users.viewerA.email, {
    redirectTo: 'http://127.0.0.1:3000/reset-password',
  });
  assert.ifError(reset.error);
  let messageId = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    const response = await fetch(`${process.env.LOCAL_MAIL_URL}/api/v1/messages`);
    assert.equal(response.status, 200);
    const mailbox = await response.json();
    messageId = (mailbox.messages || []).find(message => JSON.stringify(message).includes(state.users.viewerA.email))?.ID;
    if (messageId) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(messageId, 'the local recovery message was not received');
  const detailResponse = await fetch(`${process.env.LOCAL_MAIL_URL}/api/v1/message/${encodeURIComponent(messageId)}`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  const urls = [...`${detail.Text || ''} ${detail.HTML || ''}`.matchAll(/https?:\/\/[^\s"<>]+/g)].map(match => {
    try { return new URL(match[0].replaceAll('&amp;', '&')); } catch { return null; }
  }).filter(Boolean);
  const link = urls.find(value => value.origin === url && value.pathname === '/auth/v1/verify' && value.searchParams.get('type') === 'recovery');
  assert.ok(link, 'no recovery link bound to the local Auth service');
  const first = await fetch(link, { redirect: 'manual' });
  assert.ok([302, 303].includes(first.status), 'the recovery link was not accepted once');
  const redirect = new URL(first.headers.get('location'));
  assert.equal(redirect.origin, 'http://127.0.0.1:3000');
  assert.ok(redirect.hash.includes('access_token='), 'recovery did not issue a temporary session');
  const fragment = new URLSearchParams(redirect.hash.slice(1));
  const recovered = createClient(url, process.env.SUPABASE_LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await recovered.auth.setSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') });
  assert.ifError(session.error);
  assert.equal(session.data.user.id, state.users.viewerA.id);
  const changedPassword = `Phase4H-${randomUUID()}!`;
  const changed = await recovered.auth.updateUser({ password: changedPassword });
  assert.ifError(changed.error);
  const oldLogin = await createClient(url, process.env.SUPABASE_LOCAL_ANON_KEY, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: state.users.viewerA.email, password });
  assert.ok(oldLogin.error, 'old password remained valid after recovery');
  const newLogin = await createClient(url, process.env.SUPABASE_LOCAL_ANON_KEY, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: state.users.viewerA.email, password: changedPassword });
  assert.ifError(newLogin.error); assert.equal(newLogin.data.user.id, state.users.viewerA.id);
  const otherAccount = await state.clients.adminA.auth.getUser();
  assert.ifError(otherAccount.error); assert.equal(otherAccount.data.user.id, state.users.adminA.id);
  const replay = await fetch(link, { redirect: 'manual' });
  assert.ok(![302, 303].includes(replay.status) || !new URL(replay.headers.get('location')).hash.includes('access_token='), 'recovery link replay issued a second session');
});

test('local employee invitation remains pending until its single-use mail link is accepted', async (t) => {
  if (guard(t)) return;
  if (!process.env.LOCAL_MAIL_URL) { t.skip('The independent stack does not include local mail and Edge Runtime.'); return; }
  const email = `phase4h-invite-${suffix}@example.test`;
  const invited = await state.clients.adminA.functions.invoke('invite-organization-user', {
    body: { email, fullName: 'Local Invitee', role: 'viewer', department: 'Test' },
  });
  assert.ifError(invited.error);
  assert.equal(invited.data?.user?.email, email);
  const invitedId = invited.data.user.id;
  state.users.invitee = { id: invitedId, email };
  const rowBefore = await service.from('organization_invitations').select('status,role').eq('organization_id', state.orgs.a).eq('email', email).single();
  assert.ifError(rowBefore.error);
  assert.equal(rowBefore.data.status, 'pending', 'invitation was accepted before the recipient used the link');
  const memberBefore = await service.from('organization_members').select('status').eq('organization_id', state.orgs.a).eq('user_id', invitedId);
  assert.ifError(memberBefore.error); assert.equal(memberBefore.data.length, 0, 'invited user received membership before accepting');
  let messageId;
  for (let attempt = 0; attempt < 15; attempt++) {
    const inbox = await (await fetch(`${process.env.LOCAL_MAIL_URL}/api/v1/messages`)).json();
    messageId = (inbox.messages || []).find(message => JSON.stringify(message).includes(email))?.ID;
    if (messageId) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(messageId, 'local invitation mail was not delivered');
  const detail = await (await fetch(`${process.env.LOCAL_MAIL_URL}/api/v1/message/${encodeURIComponent(messageId)}`)).json();
  const urls = [...`${detail.Text || ''} ${detail.HTML || ''}`.matchAll(/https?:\/\/[^\s"<>]+/g)]
    .map(match => { try { return new URL(match[0].replaceAll('&amp;', '&')); } catch { return null; } }).filter(Boolean);
  const link = urls.find(candidate => candidate.origin === url && candidate.pathname === '/auth/v1/verify' && candidate.searchParams.get('type') === 'invite');
  assert.ok(link, 'invitation message did not contain a local Auth invite link');
  const accepted = await fetch(link, { redirect: 'manual' });
  assert.ok([302, 303].includes(accepted.status), 'local invitation link was not accepted');
  assert.equal(new URL(accepted.headers.get('location')).origin, 'http://127.0.0.1:3000');
  const rowAfter = await service.from('organization_invitations').select('status').eq('organization_id', state.orgs.a).eq('email', email).single();
  assert.ifError(rowAfter.error); assert.equal(rowAfter.data.status, 'accepted');
  const memberAfter = await service.from('organization_members').select('role,status').eq('organization_id', state.orgs.a).eq('user_id', invitedId).single();
  assert.ifError(memberAfter.error); assert.equal(memberAfter.data.role, 'viewer'); assert.equal(memberAfter.data.status, 'active');
  const replay = await fetch(link, { redirect: 'manual' });
  assert.ok(![302, 303].includes(replay.status) || !new URL(replay.headers.get('location')).hash.includes('access_token='), 'invitation link replay issued a session');
});

test('revoked and expired invitations never create membership after email confirmation', async (t) => {
  if (guard(t)) return;
  if (!process.env.LOCAL_MAIL_URL) { t.skip('The independent stack does not include local mail and Edge Runtime.'); return; }
  for (const stateName of ['revoked', 'expired']) {
    const email = `phase4h-${stateName}-${suffix}@example.test`;
    const sent = await state.clients.adminA.functions.invoke('invite-organization-user', {
      body: { email, fullName: `Local ${stateName}`, role: 'operator', department: 'Test' },
    });
    assert.ifError(sent.error);
    const invitedId = sent.data.user.id;
    state.users[`invite_${stateName}`] = { id: invitedId, email };
    const change = stateName === 'revoked' ? { status: 'revoked' } : { expires_at: new Date(Date.now() - 60_000).toISOString() };
    const changed = await service.from('organization_invitations').update(change)
      .eq('organization_id', state.orgs.a).eq('email', email);
    assert.ifError(changed.error);
    let messageId;
    for (let attempt = 0; attempt < 15; attempt++) {
      const inbox = await (await fetch(`${process.env.LOCAL_MAIL_URL}/api/v1/messages`)).json();
      messageId = (inbox.messages || []).find(message => JSON.stringify(message).includes(email))?.ID;
      if (messageId) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(messageId);
    const detail = await (await fetch(`${process.env.LOCAL_MAIL_URL}/api/v1/message/${encodeURIComponent(messageId)}`)).json();
    const urls = [...`${detail.Text || ''} ${detail.HTML || ''}`.matchAll(/https?:\/\/[^\s"<>]+/g)]
      .map(match => { try { return new URL(match[0].replaceAll('&amp;', '&')); } catch { return null; } }).filter(Boolean);
    const link = urls.find(candidate => candidate.origin === url && candidate.pathname === '/auth/v1/verify' && candidate.searchParams.get('type') === 'invite');
    assert.ok(link);
    const confirmed = await fetch(link, { redirect: 'manual' });
    assert.ok([302, 303].includes(confirmed.status));
    const membership = await service.from('organization_members').select('status')
      .eq('organization_id', state.orgs.a).eq('user_id', invitedId);
    assert.ifError(membership.error);
    assert.deepEqual(membership.data, [], `${stateName} invite granted membership`);
  }
});

after(async () => {
  if (!service) return;
  if (state.orgs.a && state.users.adminA) await service.storage.from('knowledge-files').remove([`${state.orgs.a}/${state.users.adminA.id}/${suffix}/attachment.txt`]);
  const createdBy = Object.values(state.users).map(user => user?.id).filter(Boolean);
  if (createdBy.length) {
    const owned = await service.from('organizations').select('id').in('created_by', createdBy);
    if (!owned.error) for (const row of owned.data || []) await service.from('organizations').delete().eq('id', row.id);
  }
  for (const organization of Object.values(state.orgs)) if (organization) await service.from('organizations').delete().eq('id', organization);
  for (const user of Object.values(state.users)) if (user?.id) await service.auth.admin.deleteUser(user.id);
});
