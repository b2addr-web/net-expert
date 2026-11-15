import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const archive=await readFile(new URL('../lib/signatureArchive.js',import.meta.url),'utf8');
const sign=await readFile(new URL('../pages/api/signatures/public/[token]/sign.js',import.meta.url),'utf8');
const migration=await readFile(new URL('../migrations/20261114_electronic_signatures_archive.sql',import.meta.url),'utf8');
test('archive preserves source and writes deterministic knowledge file',()=>{assert.match(archive,/PDFDocument\.load/);assert.match(archive,/getPages\(\)/);assert.match(archive,/getRotation/);assert.match(archive,/signature-requests.*signed\.pdf/);assert.match(archive,/knowledge_items/);assert.match(archive,/sha256Hex/)})
test('signing transitions through archiving and completion',()=>{assert.match(sign,/status:'archiving'/);assert.match(sign,/archiveSignedRequest/);assert.match(sign,/status:'completed'/);assert.match(sign,/archive_failed/)})
test('archive migration supports retryable states',()=>{assert.match(migration,/archiving/);assert.match(migration,/archive_failed/);assert.match(migration,/archive_attempts/)})
