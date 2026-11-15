import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/20261114_electronic_signatures.sql', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../components/WorkspaceSidebar.js', import.meta.url), 'utf8');
const rbac = await readFile(new URL('../lib/rbac.js', import.meta.url), 'utf8');

test('phase B migration defines tenant-scoped signature tables and statuses', () => {
  for (const table of ['signature_templates', 'signature_requests', 'signature_events']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const status of ['pending_send','sent','awaiting_signature','signed','send_failed','expired','cancelled']) assert.match(migration, new RegExp(status));
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /final_knowledge_item_id uuid references public\.knowledge_items/);
  assert.match(migration, /original_file_path text not null unique/);
  assert.match(migration, /revoke all on public\.signature_templates,public\.signature_requests,public\.signature_events from anon/);
});

test('signatures is a child of the existing knowledge sidebar group and is not a replacement', () => {
  assert.match(sidebar, /key:'knowledge'.*items:\['notes','files','signatures'\]/s);
  assert.match(rbac, /'notes','files','signatures'/);
});

test('migration keeps final documents on the existing knowledge files path', () => {
  assert.match(migration, /knowledge_storage_readable/);
  assert.match(migration, /final_knowledge_item_id/);
  assert.doesNotMatch(migration, /create bucket.*signature/i);
});

test('phase C uses a real multi-page PDF viewer and normalized placement', async () => {
  const source = await readFile(new URL('../components/ElectronicSignaturePanel.js', import.meta.url), 'utf8');
  assert.match(source, /pdfjs-dist\/build\/pdf\.mjs/);
  assert.match(source, /doc\.numPages/);
  assert.match(source, /signature-pdf-box/);
  assert.match(source, /pageWidth/);
  assert.match(source, /onPointerMove/);
  assert.match(source, /Math\.max\(0/);
});
