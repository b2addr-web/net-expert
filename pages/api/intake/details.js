import {adminContext,serverClient} from '../../../lib/intake-server';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow',['GET']);return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 try{
  const admin=await adminContext(req);if(!admin)return res.status(403).json({error:'ADMIN_REQUIRED'});
  const id=String(req.query.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'INVALID_ID'});
  const db=serverClient();
  const {data:record,error}=await db.from('intake_cases').select('*').eq('id',id).eq('organization_id',admin.organizationId).maybeSingle();
  if(error)throw error;if(!record)return res.status(404).json({error:'CASE_NOT_FOUND'});
  const {data:notes,error:noteError}=await db.from('intake_notes').select('id,body,old_status,new_status,created_at').eq('case_id',id).eq('organization_id',admin.organizationId).order('created_at',{ascending:true});
  if(noteError)throw noteError;
  let imageUrl=null;
  if(record.attachment_path){const {data}=await db.storage.from('intake-images').createSignedUrl(record.attachment_path,60);imageUrl=data?.signedUrl||null;}
  return res.status(200).json({record,notes,imageUrl});
 }catch(error){console.error('Intake details failed',{message:error.message});return res.status(500).json({error:'DETAILS_FAILED'});}
}
