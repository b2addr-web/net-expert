import assert from 'node:assert/strict';
import test from 'node:test';
import { processStagingFixtureJob } from './staging-mock-worker.mjs';

const organizationId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const fixture = { organizationId, requestId, jobId };

test('scoped mock claims a pending fixture once and never touches a neighboring job', async () => {
  const jobs = [
    { id: jobId, organization_id: organizationId, signature_request_id: requestId, status: 'pending', attempts: 0, next_attempt_at: null, idempotency_key: 'fixture-only' },
    { id: 'neighbor', organization_id: organizationId, signature_request_id: 'another-request', status: 'pending', attempts: 0, next_attempt_at: '2020-01-01T00:00:00.000Z' },
  ];
  const request = { id: requestId, organization_id: organizationId, status: 'pending_send', whatsapp_consent_confirmed: true, token_expires_at: '2099-01-01T00:00:00.000Z', phone_e164: '+12025550101' };
  const settings = { enabled: true, template_status: 'approved', template_name: 'signature_request', mode: 'netexpert' };
  const db = {
    rpc() { assert.fail('must not claim from the shared queue'); },
    from(table) {
      const rows = { whatsapp_send_jobs: jobs, signature_requests: [request], whatsapp_settings: [settings] }[table];
      const filters = [];
      let patch;
      const query = {
        update(fields) { patch = fields; return this; },
        eq(key, value) { if (table !== 'whatsapp_settings') filters.push(row => row[key] === value); return this; },
        or(condition) {
          assert.match(condition, /^next_attempt_at\.is\.null,next_attempt_at\.lte\./);
          const deadline = condition.split('.lte.')[1];
          filters.push(row => row.next_attempt_at === null || row.next_attempt_at <= deadline);
          return this;
        },
        in(key, values) { filters.push(row => values.includes(row[key])); return this; },
        select() { return this; },
        then(resolve) {
          const matched = rows.filter(row => filters.every(filter => filter(row)));
          if (patch) for (const row of matched) Object.assign(row, patch);
          return Promise.resolve({ data: matched }).then(resolve);
        },
        async single() { return { data: (await this).data[0] }; },
        async maybeSingle() { return this.single(); },
      };
      return query;
    },
  };
  assert.deepEqual(await processStagingFixtureJob(db, { ...fixture, organizationId: requestId }), { status: 'empty' });
  const results = await Promise.all([processStagingFixtureJob(db, fixture), processStagingFixtureJob(db, fixture)]);
  assert.deepEqual(results.map(x => x.status).sort(), ['accepted', 'empty']);
  assert.match(jobs[0].provider_message_id, /^mock-[a-f0-9]{24}$/);
  assert.equal(jobs[0].attempts, 1);
  assert.equal(jobs[1].status, 'pending');
  assert.equal(jobs[1].attempts, 0);
  assert.equal(request.status, 'sent');
});

test('scoped mock rejects invalid fixture identifiers before querying', () => {
  assert.throws(() => processStagingFixtureJob(null, { ...fixture, jobId: 'invalid' }), /Invalid fixture job identity/);
});
