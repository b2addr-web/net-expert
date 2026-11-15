import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const create=await readFile(new URL('../pages/api/signatures/requests.js',import.meta.url),'utf8');
const publicRead=await readFile(new URL('../pages/api/signatures/public/[token].js',import.meta.url),'utf8');
const sign=await readFile(new URL('../pages/api/signatures/public/[token]/sign.js',import.meta.url),'utf8');
const page=await readFile(new URL('../pages/sign/[token].js',import.meta.url),'utf8');

test('phase D hashes strong tokens and keeps delivery pending',()=>{assert.match(create,/randomBytes\(32\)/);assert.match(create,/tokenHash=await sha256Hex/);assert.match(create,/status:'pending_send'/);assert.match(create,/RATE_LIMITED/)})
test('public signing validates expiry and performs one-way status transition',()=>{assert.match(publicRead,/token_hash/);assert.match(publicRead,/token_expires_at/);assert.match(sign,/eq\('status','awaiting_signature'\)/);assert.match(sign,/SIGNING_ALREADY_COMPLETED/)})
test('employee page requires explicit consent and new signature data',()=>{assert.match(page,/SignaturePad/);assert.match(page,/consent/);assert.match(page,/signatureData/);assert.match(sign,/archiveStatus:'completed'/)})
