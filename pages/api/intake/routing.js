import {adminContext,canReadIntake,canWriteIntake,serverClient,validText} from '../../../lib/intake-server';
import {deliverIntakeEmails,logIntakeDeliveryError} from '../../../lib/intake-notifications';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const checked=({data,error})=>{if(error)throw error;return data};
const members=async(db,org,kind,write=false)=>{
 const eligible=checked(await db.rpc('intake_eligible',{p_org:org,p_kind:kind,p_write:write}));
 if(!eligible.length)return [];
 const profiles=checked(await db.from('profiles').select('id,full_name,email').in('id',eligible.map(x=>x.user_id)));
 const names=new Map(profiles.map(x=>[x.id,x.full_name||x.email]));
 return eligible.map(x=>({id:x.user_id,name:names.get(x.user_id)||x.user_id}));
};

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  const context=await adminContext(req);
  if(!context)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const db=serverClient(),org=context.organizationId,actor=context.user.id;
  if(req.method==='GET'){
   const settingsMode=req.query.mode==='settings';
   if(settingsMode?context.role!=='company_admin':!canReadIntake(context,'report'))return res.status(403).json({error:'NOT_AUTHORIZED'});
   const categories=checked(await db.from('intake_categories').select(settingsMode?'id,name,active,recipients':'id,name,active').eq('organization_id',org).order('name'));
   if(!settingsMode)return res.json({categories,reportMembers:await members(db,org,'report',true)});
   const [settings,reportMembers,deviceMembers]=await Promise.all([
    db.from('intake_notification_settings').select('*').eq('organization_id',org).maybeSingle(),
    members(db,org,'report'),members(db,org,'device_request')
   ]);
   return res.json({categories,settings:checked(settings),reportMembers,deviceMembers});
  }
  const body=req.body||{};
  if(body.action==='assign'){
   if(!canWriteIntake(context,'report'))return res.status(403).json({error:'NOT_AUTHORIZED'});
   if(!uuid(body.caseId)||!(body.recipient===null||uuid(body.recipient))||!(body.expected===null||uuid(body.expected)))
    return res.status(400).json({error:'INVALID_FIELDS'});
   const event=checked(await db.rpc('intake_assign_case',{p_org:org,p_actor:actor,p_case:body.caseId,p_recipient:body.recipient,p_expected:body.expected}));
   if(event)await deliverIntakeEmails(db,org,body.caseId).catch(logIntakeDeliveryError);
   return res.json({ok:true});
  }
  if(context.role!=='company_admin')return res.status(403).json({error:'NOT_AUTHORIZED'});
  if(!Array.isArray(body.recipients)||body.recipients.length>100||!body.recipients.every(uuid))
   return res.status(400).json({error:'INVALID_FIELDS'});
  let data;
  if(body.action==='settings'&&['enabled','email_enabled','bell_enabled'].every(k=>typeof body[k]==='boolean')&&
   (body.default_recipient===null||uuid(body.default_recipient))){
   const {enabled,email_enabled,bell_enabled,default_recipient,recipients}=body;
   data={enabled,email_enabled,bell_enabled,default_recipient,recipients};
  }else if(body.action==='category'&&validText(body.name,120)&&typeof body.active==='boolean'&&(body.id===null||uuid(body.id))){
   const {id,name,active,recipients}=body;
   data={id,name,active,recipients};
  }else return res.status(400).json({error:'INVALID_FIELDS'});
  checked(await db.rpc('intake_save_routing',{p_org:org,p_actor:actor,p_action:body.action,p_data:data}));
  return res.json({ok:true});
 }catch(error){
  const message=error.message;
  if(message==='CASE_CHANGED'||error.code==='23505')return res.status(409).json({error:message==='CASE_CHANGED'?message:'DUPLICATE_CATEGORY'});
  if(message==='INVALID_RECIPIENT')return res.status(400).json({error:message});
  if(message==='NOT_FOUND')return res.status(404).json({error:message});
  if(message==='NOT_AUTHORIZED')return res.status(403).json({error:message});
  console.error('Intake routing failed',{code:error.code||'ROUTING_FAILED'});
  return res.status(500).json({error:'ROUTING_FAILED'});
 }
}
