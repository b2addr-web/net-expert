import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';

// Load only the pure token functions; no Supabase client or live configuration is used.
const source=(await readFile(new URL('../lib/intake-server.js',import.meta.url),'utf8'))
 .replace("import {createClient} from '@supabase/supabase-js';",'');
const {sealToken,openToken,canReadIntake,canWriteIntake}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const previousSecret=process.env.INTAKE_LINK_SECRET;
process.env.INTAKE_LINK_SECRET='local-test-secret-never-used-in-production';
test.after(()=>{if(previousSecret===undefined)delete process.env.INTAKE_LINK_SECRET;else process.env.INTAKE_LINK_SECRET=previousSecret});

test('AES-GCM preserves existing three-part token format and uses unique nonces',()=>{
 const tokens=Array.from({length:64},()=>sealToken('synthetic-public-link-token'));
 assert.equal(new Set(tokens.map(token=>token.split('.')[0])).size,tokens.length);
 for(const token of tokens){
  const [iv,tag,ciphertext]=token.split('.');
  assert.equal(Buffer.from(iv,'base64url').length,12);
  assert.equal(Buffer.from(tag,'base64url').length,16);
  assert.ok(ciphertext.length>0);
  assert.equal(openToken(token),'synthetic-public-link-token');
 }
});

test('AES-GCM rejects altered ciphertext, nonce, tag, and incomplete tokens',()=>{
 const parts=sealToken('synthetic-public-link-token').split('.');
 const change=part=>(part[0]==='A'?'B':'A')+part.slice(1);
 for(let index=0;index<3;index++){
  const changed=[...parts];changed[index]=change(changed[index]);
  assert.throws(()=>openToken(changed.join('.')),/INVALID_TOKEN/);
 }
 for(const malformed of ['',parts.slice(0,2).join('.'),`${parts.join('.')}.extra`,`${parts[0]}.A.${parts[2]}`,`${parts[0]}.${parts[1]}.`,`${parts[0]}*.${parts[1]}.${parts[2]}`]){
  assert.throws(()=>openToken(malformed),/INVALID_TOKEN/);
 }
});

test('AES-GCM opens a token produced by the previous three-part encoder',()=>{
 const iv=randomBytes(12);
 const key=createHash('sha256').update(process.env.INTAKE_LINK_SECRET).digest();
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update('legacy-synthetic-token','utf8'),cipher.final()]);
 const legacy=[iv,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64url')).join('.');
 assert.equal(openToken(legacy),'legacy-synthetic-token');
});

test('public intake role helpers deny writes to viewers and unrelated sections',()=>{
 const viewer={role:'viewer',permissions:{report:true,device_request:false}};
 const operator={role:'operator',permissions:{report:true,device_request:false}};
 assert.equal(canReadIntake(viewer,'report'),true);
 assert.equal(canWriteIntake(viewer,'report'),false);
 assert.equal(canReadIntake(operator,'device_request'),false);
 assert.equal(canWriteIntake(operator,'device_request'),false);
 assert.equal(canWriteIntake(operator,'report'),true);
 assert.equal(canReadIntake({role:'company_admin'},'unknown'),false);
});
