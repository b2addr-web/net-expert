import crypto from 'node:crypto';
import {whatsappProvider} from './whatsapp.js';

const MAX_ATTEMPTS=Number(process.env.WHATSAPP_MAX_ATTEMPTS||5);
const backoff=attempt=>new Date(Date.now()+Math.min(24*60*60*1000,Math.pow(2,Math.max(0,attempt-1))*60000));
const transient=error=>Boolean(error?.transient||['ETIMEDOUT','ECONNRESET','RATE_LIMITED','PROVIDER_UNAVAILABLE'].includes(error?.code));

export async function processOneWhatsAppJob(db,provider=whatsappProvider(),now=new Date()){
  const workerId=crypto.randomUUID(),{data:rows,error:claimError}=await db.rpc('claim_whatsapp_send_job',{p_worker_id:workerId,p_now:now.toISOString()});
  if(claimError)throw claimError;const job=rows?.[0];if(!job)return {status:'empty'};
  const {data:request,error:requestError}=await db.from('signature_requests').select('id,organization_id,employee_name,phone_e164,token_expires_at,whatsapp_consent_confirmed,status').eq('id',job.signature_request_id).single();
  if(requestError)throw requestError;
  const finish=async patch=>db.from('whatsapp_send_jobs').update({...patch,lock_token:null,locked_until:null,updated_at:now.toISOString()}).eq('id',job.id).eq('lock_token',workerId);
  if(request.status==='completed'||request.status==='cancelled'||new Date(request.token_expires_at)<=now){await finish({status:'failed',last_error:'SIGNING_REQUEST_NOT_SENDABLE'});if(new Date(request.token_expires_at)<=now)await db.from('signature_requests').update({status:'expired'}).eq('id',request.id).in('status',['pending_send','sent']);return {status:'failed',reason:'not_sendable'};}
  if(request.whatsapp_consent_confirmed!==true){await finish({status:'failed',last_error:'RECIPIENT_CONSENT_REQUIRED'});return {status:'failed',reason:'consent_required'};}
  const {data:settings}=await db.from('whatsapp_settings').select('mode,account_id,enabled,template_name,template_status').eq('organization_id',request.organization_id).maybeSingle();
  if(!settings?.enabled||settings.template_status!=='approved'){await finish({status:'failed',last_error:'WHATSAPP_NOT_CONFIGURED'});return {status:'failed',reason:'not_configured'};}
  let accountId=settings.mode==='company'?settings.account_id:null;if(settings.mode==='company'&&!accountId){await finish({status:'failed',last_error:'COMPANY_ACCOUNT_UNAVAILABLE'});return {status:'failed',reason:'account_unavailable'};}
  let providerResult;try{providerResult=await provider.sendTemplate({to:request.phone_e164,templateName:settings.template_name,idempotencyKey:job.idempotency_key,accountId})}catch(error){if(error?.uncertain){await finish({status:'uncertain',uncertain_at:now.toISOString(),last_error:'PROVIDER_RESPONSE_UNCERTAIN'});return {status:'uncertain'}}const retry=transient(error)&&job.attempts<MAX_ATTEMPTS;await finish(retry?{status:'pending',next_attempt_at:backoff(job.attempts),last_error:'TRANSIENT_PROVIDER_ERROR'}:{status:'failed',last_error:'PERMANENT_PROVIDER_ERROR'});return {status:retry?'retry_scheduled':'failed',attempts:job.attempts}}
  if(!providerResult?.providerMessageId)throw Object.assign(new Error('PROVIDER_RESPONSE_UNCERTAIN'),{uncertain:true});
  await finish({status:'accepted',provider_message_id:providerResult.providerMessageId,accepted_at:now.toISOString(),last_error:null});await db.from('signature_requests').update({status:'sent'}).eq('id',request.id).in('status',['pending_send','send_failed']);return {status:'accepted',providerMessageId:providerResult.providerMessageId};
}

export async function processWhatsAppQueue(db,provider=whatsappProvider(),limit=10){const results=[];for(let i=0;i<limit;i++){try{const result=await processOneWhatsAppJob(db,provider);results.push(result);if(result.status==='empty')break}catch(error){results.push({status:'error',error:transient(error)?'TRANSIENT_PROVIDER_ERROR':'PROVIDER_RESPONSE_UNCERTAIN'});break}}return results}
