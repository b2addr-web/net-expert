import {adminContext,canReadIntake,serverClient} from '../../../lib/intake-server';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow',['GET']);return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 try{
  const admin=await adminContext(req);if(!admin)return res.status(403).json({error:'ADMIN_REQUIRED'});
  const id=String(req.query.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'INVALID_ID'});
  const db=serverClient();
  const {data:record,error}=await db.from('intake_cases').select('*').eq('id',id).eq('organization_id',admin.organizationId).maybeSingle();
  if(error)throw error;if(!record)return res.status(404).json({error:'CASE_NOT_FOUND'});
  if(!canReadIntake(admin,record.kind))return res.status(403).json({error:'NOT_AUTHORIZED'});
  const {data:notes,error:noteError}=await db.from('intake_notes').select('id,body,old_status,new_status,created_at').eq('case_id',id).eq('organization_id',admin.organizationId).order('created_at',{ascending:true});
  if(noteError)throw noteError;
  let imageUrl=null;
  if(record.attachment_path){
   const {data,error:imageError}=await db.storage.from('intake-images').createSignedUrl(record.attachment_path,600);
   if(imageError)console.error('Intake signed image failed',{message:imageError.message});
   imageUrl=data?.signedUrl||null;
  }
  let assignments=[];
  if(record.kind==='report'){
   const history=await db.from('intake_routing_audit').select('id,actor_id,details,created_at')
    .eq('organization_id',admin.organizationId).eq('case_id',record.id).eq('action','assigned').order('created_at',{ascending:false});
   if(history.error)throw history.error;
   assignments=history.data;
   const ids=[...new Set(assignments.flatMap(x=>[x.actor_id,x.details.from,x.details.to]).filter(Boolean))];
   if(ids.length){
    const memberRows=await db.from('organization_members').select('user_id').eq('organization_id',admin.organizationId).in('user_id',ids);
    if(memberRows.error)throw memberRows.error;
    if(memberRows.data.length){
     const profiles=await db.from('profiles').select('id,full_name,email').in('id',memberRows.data.map(x=>x.user_id));
     if(profiles.error)throw profiles.error;
     const names=new Map(profiles.data.map(x=>[x.id,x.full_name||x.email]));
     assignments=assignments.map(x=>({...x,actorName:names.get(x.actor_id)||null,recipientName:names.get(x.details.to)||null}));
    }
   }
  }
  return res.status(200).json({record,notes,assignments,imageUrl,imageUnavailable:Boolean(record.attachment_path&&!imageUrl)});
 }catch(error){console.error('Intake details failed',{message:error.message});return res.status(500).json({error:'DETAILS_FAILED'});}
}
