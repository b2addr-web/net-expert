import test from 'node:test';
import assert from 'node:assert/strict';

const url=process.env.SUPABASE_LOCAL_URL;
const required=['SUPABASE_LOCAL_URL','SUPABASE_LOCAL_ANON_KEY','SUPABASE_LOCAL_SERVICE_ROLE_KEY'];
const missing=required.filter(name=>!process.env[name]);

function isLocalSupabase(value){
 try{
  const parsed=new URL(value);
  return parsed.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(parsed.hostname);
 }catch{return false}
}

test('local Supabase test suite refuses non-local targets',()=>{
 if(missing.length){
  test.skip(`Local Supabase is not configured (${missing.join(', ')}).`);
  return;
 }
 assert.equal(isLocalSupabase(url),true,'SUPABASE_LOCAL_URL must be an http localhost address; refusing a remote target.');
 assert.ok(process.env.SUPABASE_LOCAL_ANON_KEY.length>20,'A local anon key is required.');
 assert.ok(process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY.length>20,'A local service role key is required.');
});
