import {adminContext,serverClient,newToken,tokenHash,sealToken,openToken,REPORT_STATUSES,REQUEST_STATUSES,sendCaseEmail,validText} from '../../../lib/intake-server';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','PATCH'].includes(req.method)){res.setHeader('Allow',['GET','POST','PATCH']);return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 try{
  const admin=await adminContext(req);if(!admin)return res.status(403).json({error:'ADMIN_REQUIRED'});
  const db=serverClient(),org=admin.organizationId;
  if(req.method==='GET'){
   const [{data:links,error:linksError},{data:cases,error:casesError}]=await Promise.all([
    db.from('intake_links').select('id,kind,label,active,created_at,token_encrypted').eq('organization_id',org).order('created_at',{ascending:false}),
    db.from('intake_cases').select('id,reference,kind,employee_name,employee_number,email,department,issue_type,device_type,description,status,attachment_path,created_at,updated_at').eq('organization_id',org).order('created_at',{ascending:false}).limit(1000)
   ]);
   if(linksError||casesError)throw linksError||casesError;
   return res.status(200).json({links:links.map(({token_encrypted,...link})=>({...link,url:`${process.env.NEXT_PUBLIC_SITE_URL}/intake/${openToken(token_encrypted)}`})),cases});
  }
  const body=req.body||{};
  if(req.method==='POST'){
   if(body.action==='create_link'){
    if(!['report','device_request'].includes(body.kind)||!validText(body.label,100))return res.status(400).json({error:'INVALID_FIELDS'});
    const token=newToken();
    if(!process.env.NEXT_PUBLIC_SITE_URL)return res.status(503).json({error:'SITE_URL_NOT_CONFIGURED'});
    const {data,error}=await db.from('intake_links').insert({organization_id:org,kind:body.kind,label:body.label.trim(),token_hash:tokenHash(token),token_encrypted:sealToken(token),created_by:admin.user.id}).select('id,kind,label,active,created_at').single();
    if(error)throw error;
    return res.status(201).json({link:data,url:`${process.env.NEXT_PUBLIC_SITE_URL}/intake/${token}`});
   }
   if(body.action==='note'){
    if(!validText(body.caseId,40)||!validText(body.note,3000))return res.status(400).json({error:'INVALID_FIELDS'});
    const {data:record}=await db.from('intake_cases').select('id').eq('id',body.caseId).eq('organization_id',org).maybeSingle();
    if(!record)return res.status(404).json({error:'CASE_NOT_FOUND'});
    const {error}=await db.from('intake_notes').insert({case_id:record.id,organization_id:org,body:body.note.trim(),actor_id:admin.user.id});if(error)throw error;
    return res.status(201).json({ok:true});
   }
   return res.status(400).json({error:'UNKNOWN_ACTION'});
  }
  if(body.action==='link'){
   if(!validText(body.id,40)||typeof body.active!=='boolean')return res.status(400).json({error:'INVALID_FIELDS'});
   const {data,error}=await db.from('intake_links').update({active:body.active,disabled_at:body.active?null:new Date().toISOString()}).eq('id',body.id).eq('organization_id',org).select('id,active').maybeSingle();
   if(error)throw error;if(!data)return res.status(404).json({error:'LINK_NOT_FOUND'});
   return res.status(200).json(data);
  }
  if(body.action==='status'){
   if(!validText(body.caseId,40)||typeof body.status!=='string')return res.status(400).json({error:'INVALID_FIELDS'});
   const {data:record,error:readError}=await db.from('intake_cases').select('id,reference,kind,email,status').eq('id',body.caseId).eq('organization_id',org).maybeSingle();
   if(readError)throw readError;if(!record)return res.status(404).json({error:'CASE_NOT_FOUND'});
   const choices=record.kind==='report'?REPORT_STATUSES:REQUEST_STATUSES;
   if(!choices.includes(body.status))return res.status(400).json({error:'INVALID_STATUS'});
   if(record.status===body.status)return res.status(200).json({ok:true,emailSent:false});
   const {data:updated,error}=await db.from('intake_cases').update({status:body.status,updated_at:new Date().toISOString()}).eq('id',record.id).eq('organization_id',org).eq('status',record.status).select('id').maybeSingle();
   if(error)throw error;if(!updated)return res.status(409).json({error:'CASE_CHANGED'});
   const {error:noteError}=await db.from('intake_notes').insert({case_id:record.id,organization_id:org,body:`تغيير الحالة إلى ${body.status}`,actor_id:admin.user.id,old_status:record.status,new_status:body.status});if(noteError)console.error('Status history failed',{message:noteError.message});
   const notify=record.kind==='device_request'&&['تمت الموافقة','مرفوض','قيد التجهيز','تم التسليم'].includes(body.status);
   const email=notify?await sendCaseEmail({to:record.email,reference:record.reference,kind:record.kind,status:body.status}).catch(e=>{console.error('Status email failed',{message:e.message});return {sent:false};}):{sent:false};
   return res.status(200).json({ok:true,emailSent:email.sent});
  }
  return res.status(400).json({error:'UNKNOWN_ACTION'});
 }catch(error){console.error('Intake administration failed',{message:error.message,code:error.code});return res.status(500).json({error:'ADMIN_OPERATION_FAILED'});}
}
