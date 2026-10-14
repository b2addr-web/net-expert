import {serverClient} from './intake-server';
import {probeWebsite,lookupDomainExpiry} from './monitor-probe';

const riyadhDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const remaining=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(riyadhDate()+'T00:00:00Z'))/86400000);
const validEmail=email=>typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function recipients(db,organizationId){
 const {data:members,error}=await db.from('organization_members').select('user_id').eq('organization_id',organizationId).eq('role','company_admin').eq('status','active');
 if(error)throw error;
 if(!members.length)return [];
 const {data:profiles,error:profileError}=await db.from('profiles').select('id,email').in('id',members.map(x=>x.user_id));
 if(profileError)throw profileError;
 return [...new Set((profiles||[]).map(x=>x.email?.trim().toLowerCase()).filter(validEmail))];
}

async function sendAlert(db,{organizationId,kind,resourceId,eventKey,subject,body}){
 const emails=await recipients(db,organizationId);
 for(const email of emails){
  const {data:claimed,error:claimError}=await db.rpc('claim_platform_notification',{p_org:organizationId,p_kind:kind,p_resource:resourceId,p_event:eventKey,p_email:email});
  if(claimError)throw claimError;
  if(!claimed)continue;
  let status='failed',last_error='EMAIL_NOT_CONFIGURED';
  try{
   const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
   if(key&&from){
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:email,subject,text:body}),signal:AbortSignal.timeout(8000)});
    status=response.ok?'sent':'failed';last_error=response.ok?null:`HTTP_${response.status}`;
   }
  }catch(error){last_error=error.name==='TimeoutError'?'EMAIL_TIMEOUT':'EMAIL_FAILED'}
  const {error}=await db.from('platform_notification_log').update({status,sent_at:status==='sent'?new Date().toISOString():null,last_error,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('kind',kind).eq('resource_id',resourceId).eq('event_key',eventKey).eq('recipient_email',email);
  if(error)throw error;
 }
}

export async function runSubscriptionAlerts(){
 const db=serverClient(),today=riyadhDate(),limit=new Date(Date.parse(today+'T00:00:00Z')+14*86400000).toISOString().slice(0,10);
 const {data,error}=await db.from('service_subscriptions').select('id,organization_id,name,provider,end_date,cost,currency').gte('end_date',today).lte('end_date',limit).limit(1000);
 if(error)throw error;
 let processed=0;
 for(const item of data){
  const {data:current,error:readError}=await db.from('service_subscriptions').select('end_date').eq('id',item.id).eq('organization_id',item.organization_id).maybeSingle();
  if(readError)throw readError;if(current?.end_date!==item.end_date)continue;
  const days=remaining(item.end_date);
  await sendAlert(db,{organizationId:item.organization_id,kind:'subscription',resourceId:item.id,eventKey:`expiry:${item.end_date}`,subject:`NetExpert — تنبيه انتهاء اشتراك ${item.name}`,body:`تنبيه من NetExpert: اشتراك ${item.name} (${item.provider}) سينتهي بتاريخ ${item.end_date}، ويتبقى عليه ${days} يوماً. التكلفة: ${item.cost} ${item.currency}. يرجى اتخاذ الإجراء اللازم للتجديد.`});
  processed++;
 }
 return {processed};
}

async function checkSite(db,site){
 const now=new Date(),observed=await probeWebsite(site.url);
 if(observed.result==='online'&&observed.response_ms>site.slow_threshold_ms)observed.result='degraded';
 const failure_streak=observed.result==='down'?site.failure_streak+1:0;
 const slow_streak=observed.result==='degraded'?site.slow_streak+1:0;
 const nextStatus=observed.result==='down'&&failure_streak<2?site.status:observed.result==='degraded'&&slow_streak<2?'online':observed.result;
 const domainDue=!site.domain_checked_at||Date.parse(site.domain_checked_at)<Date.now()-86400000;
 const rdapExpiry=domainDue?await lookupDomainExpiry(site.domain_name):site.domain_source==='rdap'?site.domain_expires_on:null;
 const domainExpires=rdapExpiry||site.domain_expires_manual||null;
 const domainSource=rdapExpiry?'rdap':site.domain_expires_manual?'manual':'unavailable';
 const {error:checkError}=await db.from('monitor_checks').insert({organization_id:site.organization_id,site_id:site.id,checked_at:now.toISOString(),result:observed.result,http_status:observed.http_status,response_ms:observed.response_ms,error_type:observed.error_type,ssl_status:observed.ssl_status,ssl_expires_at:observed.ssl_expires_at});
 if(checkError)throw checkError;
 const {data:updated,error:updateError}=await db.from('monitor_sites').update({status:nextStatus,http_status:observed.http_status,response_ms:observed.response_ms,ssl_status:observed.ssl_status,ssl_expires_at:observed.ssl_expires_at,last_checked_at:now.toISOString(),check_lease_until:null,failure_streak,slow_streak,domain_checked_at:domainDue?now.toISOString():site.domain_checked_at,domain_expires_on:domainExpires,domain_source:domainSource}).eq('id',site.id).eq('organization_id',site.organization_id).eq('version',site.version).select('id').maybeSingle();
 if(updateError)throw updateError;if(!updated)return {skipped:true};
 const alertBase={organizationId:site.organization_id,resourceId:site.id};
 if(nextStatus==='down'&&site.status!=='down'){
  const {data:incident,error}=await db.from('monitor_incidents').insert({organization_id:site.organization_id,site_id:site.id,started_at:failure_streak===2&&site.last_checked_at?site.last_checked_at:now.toISOString(),reason:observed.error_type||`HTTP ${observed.http_status}`}).select('id').single();
  if(error&&error.code!=='23505')throw error;
  if(incident)await sendAlert(db,{...alertBase,kind:'monitor_down',eventKey:`down:${incident.id}`,subject:`NetExpert — توقف ${site.name}`,body:`الموقع ${site.name} (${site.url}) متوقف. اكتُشف العطل في ${now.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}. الحالة الحالية: متوقف.`});
 }
 if(site.status==='down'&&nextStatus!=='down'){
  const {data:open,error}=await db.from('monitor_incidents').select('id,started_at').eq('organization_id',site.organization_id).eq('site_id',site.id).is('ended_at',null).maybeSingle();
  if(error)throw error;
  if(open){
   const duration=Math.max(0,Math.round((now-Date.parse(open.started_at))/1000));
   const {error:closeError}=await db.from('monitor_incidents').update({ended_at:now.toISOString(),duration_seconds:duration}).eq('id',open.id).eq('organization_id',site.organization_id);if(closeError)throw closeError;
   await sendAlert(db,{...alertBase,kind:'monitor_recovered',eventKey:`recovered:${open.id}`,subject:`NetExpert — عودة ${site.name}`,body:`عاد الموقع ${site.name} (${site.url}) للعمل في ${now.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}. مدة الانقطاع ${Math.ceil(duration/60)} دقيقة. الحالة الحالية: يعمل.`});
  }
 }
 if(nextStatus==='degraded'&&site.status!=='degraded'&&slow_streak>=2)await sendAlert(db,{...alertBase,kind:'monitor_slow',eventKey:`slow:${now.toISOString()}`,subject:`NetExpert — بطء ${site.name}`,body:`الموقع ${site.name} (${site.url}) بطيء باستمرار. زمن الاستجابة ${observed.response_ms} ms عند ${now.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}. الحالة الحالية: استجابة بطيئة.`});
 const expiryEvents=[['ssl',observed.ssl_expires_at?.slice(0,10),observed.ssl_status],['domain',domainExpires,domainSource],['hosting',site.hosting_expires_on,'manual']];
 for(const [kind,expiry,state] of expiryEvents){
  if(kind==='ssl'&&state==='invalid')await sendAlert(db,{...alertBase,kind:'ssl_invalid',eventKey:`invalid:${riyadhDate()}`,subject:`NetExpert — شهادة SSL غير صالحة: ${site.name}`,body:`الموقع ${site.name} (${site.url}) لديه مشكلة في شهادة SSL بتاريخ ${now.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}. الحالة الحالية: غير صالحة.`});
  if(expiry&&remaining(expiry)>=0&&remaining(expiry)<=14)await sendAlert(db,{...alertBase,kind:`${kind}_expiry`,eventKey:`expiry:${expiry}`,subject:`NetExpert — اقتراب انتهاء ${kind}: ${site.name}`,body:`الموقع ${site.name} (${site.url}): تاريخ انتهاء ${kind} هو ${expiry}، والمتبقي ${remaining(expiry)} يوماً. وقت الاكتشاف ${now.toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}. الحالة الحالية: ${nextStatus}.`});
 }
 return {status:nextStatus};
}

export async function runMonitorChecks(){
 const db=serverClient();
 const {data:sites,error}=await db.rpc('claim_due_monitor_sites',{batch_size:20});if(error)throw error;
 const results=await Promise.allSettled((sites||[]).map(site=>checkSite(db,site)));
 const failures=results.filter(x=>x.status==='rejected');
 for(const failure of failures)console.error('Monitor site check failed',{code:failure.reason?.code||'CHECK_FAILED'});
 return {claimed:sites?.length||0,completed:results.length-failures.length,failed:failures.length};
}
