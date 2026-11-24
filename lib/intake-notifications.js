import {emailValid,sendIntakeMail} from './intake-server';

export const intakeCaseLink = record => '/?module='+record.kind+'&case='+record.id;
export const intakeNotificationTitle = (kind,event,ar=true) => event!=='created'
 ? (ar?'تم إسناد بلاغ إليك':'Report assigned to you')
 : kind==='report'?(ar?'بلاغ تقني جديد':'New technical report'):(ar?'طلب جهاز جديد':'New device request');

function mailContent(record,event) {
 const title=intakeNotificationTitle(record.kind,event);
 const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL && 'https://'+process.env.VERCEL_URL) || 'http://localhost:3000');
 const link=new URL(intakeCaseLink(record),origin).href;
 const timestamp=new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh',calendar:'gregory'}).format(new Date(record.created_at));
 const fields=[['الرقم المرجعي',record.reference],['مقدم الطلب',record.employee_name],['القسم',record.department],
  [record.kind==='report'?'تصنيف المشكلة':'نوع الجهاز',record.issue_type||record.device_type],['وقت الإنشاء',timestamp]];
 const escape=value=>String(value??'—').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
 return {subject:title+' | '+record.reference,text:fields.map(([key,value])=>key+': '+value).join('\n')+'\n'+link,
  html:'<main dir="rtl" style="font:16px Arial;color:#18253a;padding:24px"><strong>NetExpert</strong><h1>'+title+'</h1><dl>'+
   fields.map(([key,value])=>'<dt><strong>'+key+'</strong></dt><dd>'+escape(value)+'</dd>').join('')+
   '</dl><a style="display:inline-block;background:#1559c1;color:#fff;padding:12px 20px;border-radius:8px" href="'+escape(link)+'">عرض التفاصيل في NetExpert</a></main>'};
}

async function deliver(db,row) {
 const record=await db.from('intake_cases').select('id,kind,reference,employee_name,department,issue_type,device_type,created_at')
  .eq('organization_id',row.organization_id).eq('id',row.case_id).maybeSingle();
 if(record.error)throw record.error;
 if(!record.data)return {status:'skipped',error:'CASE_REMOVED'};
 const [eligible,profile,settings]=await Promise.all([
  db.rpc('intake_eligible',{p_org:row.organization_id,p_kind:record.data.kind,p_write:row.event_key!=='created'}),
  db.from('profiles').select('email').eq('id',row.recipient_id).maybeSingle(),
  db.from('intake_notification_settings').select('enabled,email_enabled').eq('organization_id',row.organization_id).maybeSingle()
 ]);
 for(const result of [eligible,profile,settings])if(result.error)throw result.error;
 if(!eligible.data.some(member=>member.user_id===row.recipient_id))return {status:'skipped',error:'RECIPIENT_NO_LONGER_ELIGIBLE'};
 if(settings.data&&(!settings.data.enabled||!settings.data.email_enabled))return {status:'skipped',error:'EMAIL_DISABLED'};
 const email=profile.data?.email?.trim();
 if(!emailValid(email))return {status:'skipped',error:'MISSING_RECIPIENT_EMAIL'};
 const result=await sendIntakeMail({to:email,...mailContent(record.data,row.event_key),idempotencyKey:'intake/'+row.id});
 return result.sent?{status:'sent',error:null}:{status:'failed',error:result.reason,retryable:result.retryable};
}

export async function deliverIntakeEmails(db,organizationId=null,caseId=null) {
 const {data,error}=await db.rpc('intake_claim_email',{p_org:organizationId,p_case:caseId});
 if(error)throw error;
 await Promise.all(data.map(async row=>{
  let outcome;
  try{outcome=await deliver(db,row)}catch{outcome={status:'failed',error:'DELIVERY_EXCEPTION',retryable:true}}
  const status=outcome.retryable&&row.attempts<3?'pending':outcome.status;
  const result=await db.from('intake_notifications').update({email_status:status,email_error:outcome.error,
   sent_at:status==='sent'?new Date().toISOString():null,retry_at:new Date(Date.now()+60000*row.attempts).toISOString()})
   .eq('id',row.id).eq('organization_id',row.organization_id).eq('attempts',row.attempts).eq('email_status','sending');
  if(result.error)throw result.error;
 }));
 return data.length;
}

export const logIntakeDeliveryError=error=>console.error('Intake notification delivery failed',{code:error.code||'DELIVERY_FAILED'});
