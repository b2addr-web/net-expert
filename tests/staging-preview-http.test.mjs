import assert from 'node:assert/strict';
import test from 'node:test';
import { requestPreview } from './staging-preview-http.mjs';

const preview = 'https://net-expert-abc123-b2addr-9372s-projects.vercel.app';
const path = '/api/internal/whatsapp/worker';
const bypass = 'existing-fixture-bypass';

test('sends the existing bypass only to the pinned Preview and never follows redirects', async () => {
  const fakeFetch = (url, options) => {
    assert.equal(url, preview + path);
    assert.equal(options.headers['x-vercel-protection-bypass'], bypass);
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(JSON.parse(options.body), { fixture: true });
    return new Response('{"error":"WORKER_UNAUTHORIZED"}', { status: 401 });
  };
  const result = await requestPreview(fakeFetch, preview, bypass, path, { post: true, token: 'fixture-token', body: { fixture: true } });
  assert.equal(result.status, 401);
  assert.equal(result.json.error, 'WORKER_UNAUTHORIZED');
});

test('fails before making a request when the bypass is missing or the host is Production', async () => {
  const never = () => assert.fail('should not make a request');
  await assert.rejects(requestPreview(never, preview, undefined, path), /existing project bypass/);
  await assert.rejects(requestPreview(never, 'https://www.netexpert.dev', bypass, path), /exact NetExpert Preview/);
});

test('distinguishes Vercel protection from app auth and hides transport errors', async () => {
  const redirect = () => new Response(null, { status: 302, headers: { location: 'https://example.test/login' } });
  await assert.rejects(requestPreview(redirect, preview, bypass, path), /Deployment Protection rejected/);
  const bad = () => { throw new Error('fixture-secret'); };
  await assert.rejects(requestPreview(bad, preview, bypass, path), { message: 'Preview request failed before returning a response' });
});
