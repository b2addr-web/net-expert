import {adminContext,serverClient} from '../../../lib/intake-server';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)){
  res.setHeader('Allow',['GET','POST']);
  return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 }
 try{
  const context=await adminContext(req);
  if(!context)return res.status(401).json({error:'UNAUTHENTICATED'});
  const db=serverClient();
  if(req.method==='GET'){
   if(context.role!=='company_admin')return res.status(403).json({error:'ADMIN_REQUIRED'});
   const {data,error}=await db.from('user_presence').select('user_id,last_seen_at').eq('organization_id',context.organizationId);
   if(error)throw error;
   return res.status(200).json({members:data||[]});
  }
  const {error}=await db.from('user_presence').upsert({organization_id:context.organizationId,user_id:context.user.id,last_seen_at:new Date().toISOString()},{onConflict:'organization_id,user_id'});
  if(error)throw error;
  return res.status(204).end();
 }catch(error){
  console.error('Presence operation failed',{code:error.code||'PRESENCE_FAILED'});
  return res.status(500).json({error:'PRESENCE_FAILED'});
 }
}
