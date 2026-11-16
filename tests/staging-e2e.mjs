import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import { loadStagingKeys, stagingUrl as supabase } from './staging-supabase-keys.mjs';
import { processStagingFixtureJob } from './staging-mock-worker.mjs';
import { requestPreview } from './staging-preview-http.mjs';

const preview = process.env.NETEXPERT_STAGING_PREVIEW;
const loopback = process.argv.includes('--staging-loopback');
const bucket = 'knowledge-files';
const run = randomUUID();
const users = [], orgs = [], paths = new Set();
const auth = { persistSession: false, autoRefreshToken: false };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
const data = (r, reason) => { check(!r.error, reason); return r.data; };
const cli = (command, input) => spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
  input, encoding: 'utf8', windowsHide: true, timeout: 40000,
});
let localOrigin, localApp;
async function startLocalApp(anon, service) {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  localOrigin = `http://127.0.0.1:${port}`;
  localApp = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    windowsHide: true, stdio: 'ignore',
    env: {
      ...process.env, SUPABASE_URL: supabase, NEXT_PUBLIC_SUPABASE_URL: supabase,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anon, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service, NEXT_PUBLIC_SITE_URL: localOrigin,
      WHATSAPP_PROVIDER: 'mock', WHATSAPP_WORKER_SECRET: '', RESEND_API_KEY: '',
    },
  });
  for (let i = 0; i < 40 && localApp.exitCode === null; i++) {
    try {
      const response = await fetch(localOrigin + '/', { redirect: 'manual', signal: AbortSignal.timeout(2500) });
      if (response.ok && (await response.text()).includes('__NEXT_DATA__')) return;
    } catch { /* Wait for the isolated local server to start. */ }
    await delay(500);
  }
  throw new Error('Local Next server did not start');
}

async function api(path, { token, body, post = false } = {}) {
  if (!loopback) return requestPreview(fetch, preview, process.env.VERCEL_AUTOMATION_BYPASS_SECRET, path, { token, body, post });
  check(localOrigin && /^\/(?:api|sign)\/[A-Za-z0-9_/-]+$/.test(path), 'Invalid local app route');
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(localOrigin + path, {
    method: post ? 'POST' : 'GET', headers, redirect: 'manual',
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(40000),
  });
  const raw = await response.text();
  let json;
  try { json = JSON.parse(raw); } catch { /* Signing page returns HTML. */ }
  return { status: response.status, json, page: raw.includes('__NEXT_DATA__') };
}

let db, passed = false, cleanupErrors = 0, stage = 'preflight';
try {
  const preflight = await Promise.allSettled([
    Promise.resolve().then(() => loadStagingKeys(process.env, cli)),
    loopback ? Promise.resolve() : api('/api/internal/whatsapp/worker', { post: true }).then(response => {
      check(response.status === 401 && response.json?.error === 'WORKER_UNAUTHORIZED', 'Protected Preview POST or Worker authorization check failed');
    }),
  ]);
  for (const result of preflight) if (result.status === 'rejected') console.error('Preflight: ' + result.reason.message);
  check(preflight.every(result => result.status === 'fulfilled'), 'Preflight prerequisites unavailable');
  const { anon, service } = preflight[0].value;
  db = createClient(supabase, service, { auth });
  if (loopback) {
    await startLocalApp(anon, service);
    const response = await api('/api/internal/whatsapp/worker', { post: true });
    check(response.status === 401 && response.json?.error === 'WORKER_UNAUTHORIZED', 'Local Worker endpoint did not reject missing authentication');
  }

  stage = 'fixture and tenant isolation';
  const fixture = async tag => {
    const email = `netexpert-e2e-${tag}-${run}@example.test`;
    const password = randomUUID() + '!Z9';
    const { user } = data(await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { organization_name: `E2E ${tag} ${run}` } }), 'Cannot create fixture user');
    users.push(user.id);
    const org = data(await db.from('organizations').select('id').eq('created_by', user.id).single(), 'Cannot find fixture workspace').id;
    orgs.push(org);
    const client = createClient(supabase, anon, { auth });
    const { session } = data(await client.auth.signInWithPassword({ email, password }), 'Staging fixture login failed');
    return { id: user.id, org, client, token: session.access_token };
  };
  const a = await fixture('a'), b = await fixture('b');
  check(a.org !== b.org, 'Fixtures share a workspace');
  const original = await PDFDocument.create();
  original.addPage([595, 842]);
  original.addPage([400, 600]);
  const pdf = await original.save();
  const source = `${a.org}/${a.id}/${run}.pdf`;
  paths.add(source);
  data(await db.storage.from(bucket).upload(source, pdf, { contentType: 'application/pdf' }), 'Fixture upload failed');
  const template = data(await db.from('signature_templates').insert({
    organization_id: a.org, created_by: a.id, name: run, original_file_path: source,
    original_file_name: 'test.pdf', original_file_size: pdf.length, original_sha256: sha(pdf),
    signature_page: 2, signature_x: 20, signature_y: 20, signature_width: 80, signature_height: 30, page_width: 400, page_height: 600,
  }).select('id').single(), 'Fixture template failed');
  const create = token => api('/api/signatures/requests', { post: true, token, body: {
    templateId: template.id, employeeName: 'Staging E2E ' + run, phoneE164: '+12025550101',
  } });
  check((await create(b.token)).status === 400 && data(await b.client.from('signature_templates').select('id').eq('id', template.id), 'Cannot check template RLS').length === 0, 'Cross-company signing template access was not rejected');

  stage = 'signing and archive';
  const created = await create(a.token);
  check(created.status === 201 && /^\/sign\/[A-Za-z0-9_-]{40,}$/.test(created.json?.signingUrl), 'Preview request creation failed');
  const { id, signingUrl } = created.json;
  const signedPath = `${a.org}/signature-requests/${id}/signed.pdf`;
  paths.add(signedPath);
  stage = 'Mock Worker';
  data(await db.from('whatsapp_settings').insert({ organization_id: a.org, mode: 'netexpert', enabled: true, template_name: 'signature_request', template_status: 'approved' }), 'Cannot create fixture messaging settings');
  data(await db.from('signature_requests').update({ whatsapp_consent_confirmed: true }).eq('organization_id', a.org).eq('id', id), 'Cannot record fixture consent');
  const fixtureJob = data(await db.from('whatsapp_send_jobs').select('id').eq('organization_id', a.org).eq('signature_request_id', id).single(), 'Cannot read fixture job');
  const result = await processStagingFixtureJob(db, { organizationId: a.org, requestId: id, jobId: fixtureJob.id });
  const mockId = result.providerMessageId;
  check(result.status === 'accepted' && /^mock-[a-f0-9]{24}$/.test(mockId), 'Worker did not return a Mock acceptance ID');
  const job = data(await db.from('whatsapp_send_jobs').select('status,attempts,provider_message_id').eq('id', fixtureJob.id).single(), 'Cannot verify processed queue entry');
  check(job.status === 'accepted' && job.attempts === 1 && job.provider_message_id === mockId, 'Mock result did not persist exactly once');
  const sent = data(await a.client.from('signature_requests').select('status').eq('id', id).single(), 'Cannot read the sent request');
  check(sent.status === 'sent', 'Mock Worker did not mark this request sent');
  console.log('PASS scoped local Mock Worker against the Staging queue fixture');

  stage = 'signing and archive after Mock delivery';
  const page = await api(signingUrl);
  check(page.status === 200 && page.page, 'Public signing page unavailable');
  const route = '/api/signatures/public/' + signingUrl.split('/').at(-1);
  const opened = await api(route);
  check(opened.status === 200 && opened.json?.requestId === id && opened.json.status === 'awaiting_signature' && new URL(opened.json.template.url).origin === supabase, 'Signing document did not come from Staging');
  const body = { signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', consent: 'Staging E2E test consent' };
  const signed = await api(route + '/sign', { post: true, body });
  check(signed.status === 200 && signed.json?.status === 'completed', 'Signing or PDF archive failed');
  check((await api(route + '/sign', { post: true, body })).status === 409, 'Duplicate signing was not rejected');
  const request = data(await a.client.from('signature_requests').select('final_knowledge_item_id,final_sha256').eq('id', id).single(), 'Owner cannot see signing result');
  const item = data(await a.client.from('knowledge_items').select('file_path,shared_with_team').eq('id', request.final_knowledge_item_id).single(), 'Owner cannot see archived file');
  const blob = data(await a.client.storage.from(bucket).download(signedPath), 'Owner cannot download archived PDF');
  const bytes = Buffer.from(await blob.arrayBuffer());
  check(item.file_path === signedPath && !item.shared_with_team && sha(bytes) === request.final_sha256
    && sha(bytes) !== sha(pdf) && (await PDFDocument.load(bytes)).getPageCount() === 2, 'Archived PDF integrity or privacy check failed');
  check(data(await b.client.from('knowledge_items').select('id').eq('id', request.final_knowledge_item_id), 'Cannot check archive RLS').length === 0
    && !!(await b.client.storage.from(bucket).download(signedPath)).error, 'Cross-company archive access was not denied');
  console.log('PASS signing, PDF archive and company isolation');

  passed = true;
} catch (error) {
  const safe = error.constructor === Error && /^[A-Za-z][A-Za-z_ ;:,.-]{5,100}$/.test(error.message);
  console.error(`FAIL [${stage}] ${safe ? error.message : 'Unexpected response'}`);
} finally {
  if (db) {
    const clean = async fn => { try { if ((await fn()).error) cleanupErrors++; } catch { cleanupErrors++; } };
    for (const org of orgs) {
      await clean(async () => {
        const rows = await db.from('signature_requests').select('signature_file_path').eq('organization_id', org);
        for (const row of rows.data ?? []) if (row.signature_file_path?.startsWith(org + '/')) paths.add(row.signature_file_path);
        return rows;
      });
    }
    if (paths.size) await clean(() => db.storage.from(bucket).remove([...paths]));
    for (const org of orgs) {
      await clean(() => db.from('signature_requests').delete().eq('organization_id', org));
      await clean(() => db.from('organizations').delete().eq('id', org));
    }
    for (const id of users) await clean(() => db.auth.admin.deleteUser(id));
  }
  if (localApp?.pid && localApp.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(localApp.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else localApp.kill();
  }
}
if (cleanupErrors) console.error(`FAIL fixture cleanup: ${cleanupErrors} operations`);
console.log(passed && !cleanupErrors
  ? (loopback ? 'HOSTED STAGING SIGNING AND SCOPED MOCK PASSED VIA LOCAL APP' : 'PREVIEW SIGNING AND SCOPED MOCK PASSED')
  : 'STAGING E2E INCOMPLETE');
process.exitCode = passed && !cleanupErrors ? 0 : 1;
