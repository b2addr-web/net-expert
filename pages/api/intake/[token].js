import {createHash} from 'node:crypto';
import {serverClient,tokenHash,validateSubmission,sendCaseEmail} from '../../../lib/intake-server';

export const config={api:{bodyParser:{sizeLimit:'5mb'}}};
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow',['GET','POST']);return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 res.setHeader('Cache-Control','no-store');
 const token=String(req.query.token||'');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return res.status(404).json({error:'LINK_UNAVAILABLE'});
 try{
  const db=serverClient();
  const {data:link,error:linkError}=await db.from('intake_links').select('id,organization_id,kind,label,active').eq('token_hash',tokenHash(token)).eq('active',true).maybeSingle();
  if(linkError)throw linkError;
  if(!link)return res.status(404).json({error:'LINK_UNAVAILABLE'});
  if(req.method==='GET')return res.status(200).json({kind:link.kind,label:link.label});
  const body=req.body||{};
  if(body.website)return res.status(400).json({error:'INVALID_SUBMISSION'});
  if(!validateSubmission(link.kind,body))return res.status(400).json({error:'INVALID_FIELDS'});
  let image=null;
  if(body.image){
   if(link.kind!=='report'||typeof body.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(body.image))return res.status(400).json({error:'INVALID_IMAGE'});
   const raw=Buffer.from(body.image.split(',')[1]||'','base64');
   const png=raw.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
   const jpg=raw.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
   const webp=raw.subarray(0,4).toString()==='RIFF'&&raw.subarray(8,12).toString()==='WEBP';
   if(!raw.length||raw.length>3*1024*1024||!(png||jpg||webp))return res.status(400).json({error:'INVALID_IMAGE'});
   image={raw,extension:png?'png':jpg?'jpg':'webp',type:png?'image/png':jpg?'image/jpeg':'image/webp'};
  }
  const clientIp=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  if(!process.env.INTAKE_RATE_LIMIT_SECRET)throw new Error('SERVER_NOT_CONFIGURED');
  const ipHash=createHash('sha256').update(`${process.env.INTAKE_RATE_LIMIT_SECRET}:${clientIp}`).digest('hex');
  const payload=Object.fromEntries(['employee_name','employee_number','email','department','issue_type','device_type','description'].map(key=>[key,String(body[key]||'').trim()]));
  const {data,error}=await db.rpc('submit_intake_case',{p_token_hash:tokenHash(token),p_ip_hash:ipHash,p_data:payload});
  if(error){if(/RATE_LIMITED/.test(error.message))return res.status(429).json({error:'RATE_LIMITED'});if(/LINK_UNAVAILABLE/.test(error.message))return res.status(404).json({error:'LINK_UNAVAILABLE'});throw error;}
  const record=data?.[0];if(!record)throw new Error('Case creation returned no record');
  let attachmentSaved=true;
  if(image){
   const path=`${link.organization_id}/${record.case_id}/image.${image.extension}`;
   const uploaded=await db.storage.from('intake-images').upload(path,image.raw,{contentType:image.type,upsert:false});
   if(uploaded.error){attachmentSaved=false;console.error('Intake image upload failed',{message:uploaded.error.message});}
   else await db.from('intake_cases').update({attachment_path:path}).eq('id',record.case_id).eq('organization_id',link.organization_id);
  }
  const email=await sendCaseEmail({to:record.case_email,reference:record.case_reference,kind:record.case_kind,status:'جديد'}).catch(e=>{console.error('Confirmation email failed',{message:e.message});return {sent:false};});
  return res.status(201).json({reference:record.case_reference,emailSent:email.sent,attachmentSaved});
 }catch(error){console.error('Public intake failed',{message:error.message,code:error.code});return res.status(500).json({error:'SUBMISSION_FAILED'});}
}
