import test from 'node:test';
import assert from 'node:assert/strict';
import {processOneWhatsAppJob} from '../lib/whatsapp-worker.js';
function chain(result){return{eq(){return this},in(){return Promise.resolve(result)},single(){return Promise.resolve(result)},maybeSingle(){return Promise.resolve(result)}}}
function fake({claim,request,settings}){
  const updates=[];
  return {updates,rpc:async()=>({data:claim?[claim]:[],error:null}),from(table){
    if(table==='signature_requests') return {select:()=>chain({data:request,error:null}),update(v){updates.push({table,v});return chain({data:[],error:null})}};
    if(table==='whatsapp_settings') return {select:()=>chain({data:settings,error:null})};
    if(table==='whatsapp_send_jobs') return {update(v){updates.push({table,v});return chain({data:[],error:null})}};
    throw new Error(table);
  }};
}
const baseRequest={id:'req-1',organization_id:'org-1',employee_name:'Test',phone_e164:'+966500000001',token_expires_at:new Date(Date.now()+86400000).toISOString(),whatsapp_consent_confirmed:true,status:'pending_send'};
const baseJob={id:'job-1',signature_request_id:'req-1',idempotency_key:'signature:req-1',attempts:1};
const baseSettings={enabled:true,template_status:'approved',template_name:'signature',mode:'netexpert',account_id:null};
test('worker accepts one mock message and updates the request',async()=>{const db=fake({claim:baseJob,request:baseRequest,settings:baseSettings});const result=await processOneWhatsAppJob(db,{sendTemplate:async x=>{assert.equal(x.idempotencyKey,'signature:req-1');return{providerMessageId:'mock-1'}}});assert.equal(result.status,'accepted');assert.ok(db.updates.some(x=>x.v.status==='accepted'));assert.ok(db.updates.some(x=>x.table==='signature_requests'&&x.v.status==='sent'))});
test('worker schedules transient failures with bounded retry state',async()=>{const db=fake({claim:{...baseJob,attempts:2},request:baseRequest,settings:baseSettings});const result=await processOneWhatsAppJob(db,{sendTemplate:async()=>{const e=new Error('timeout');e.code='ETIMEDOUT';throw e}});assert.equal(result.status,'retry_scheduled');assert.ok(db.updates.some(x=>x.v.status==='pending'&&x.v.next_attempt_at))});
test('worker keeps uncertain provider outcomes from being resent automatically',async()=>{const db=fake({claim:baseJob,request:baseRequest,settings:baseSettings});const result=await processOneWhatsAppJob(db,{sendTemplate:async()=>{const e=new Error('unknown');e.uncertain=true;throw e}});assert.equal(result.status,'uncertain');assert.ok(db.updates.some(x=>x.v.status==='uncertain'&&x.v.uncertain_at))});
