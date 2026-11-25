import {createClient} from '@supabase/supabase-js';
import {serverClient,validText} from '../../../lib/intake-server';
import {ownerPortalEnabled} from '../../../lib/owner-portal-host';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const money=(value,min)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=9999999999.99&&
 Math.abs(Math.round(value*100)-value*100)<0.0001;
const date=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(value);
 return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;
};

function payload(body){
 if(body.action==='settings'&&integer(body.freeLimit,0,100000)&&
  (body.freeDays===null||integer(body.freeDays,1,36500))&&money(body.monthlyPrice,0)&&integer(body.noticeDays,1,90)){
  const {freeLimit,freeDays,monthlyPrice,noticeDays}=body;
  return {freeLimit,freeDays,monthlyPrice,noticeDays};
 }
 if(!uuid(body.organizationId))return null;
 const {organizationId,endsOn,amount,receivedOn,reference}=body;
 if(['extend','trial','paid'].includes(body.action)&&(endsOn===null||date(endsOn)))return {organizationId,endsOn};
 if(body.action==='receipt'&&money(amount,.01)&&date(receivedOn)&&validText(reference,100)){
  return {organizationId,amount,receivedOn,reference:reference.trim()};
 }
 return null;
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!ownerPortalEnabled(req.headers.host))return res.status(404).json({error:'NOT_FOUND'});
 if(!['GET','POST'].includes(req.method)){
  res.setHeader('Allow','GET, POST');
  return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 }
 try{
  const bearer=req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if(!bearer)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const db=serverClient();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.getUser(bearer);
  if(error||!data?.user)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const actor=data.user.id;
  const owner=await db.from('commerce_owners').select('user_id').eq('user_id',actor).maybeSingle();
  if(owner.error)throw owner.error;
  if(!owner.data)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const assurance=await auth.auth.mfa.getAuthenticatorAssuranceLevel(bearer);
  if(assurance.error)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const mfaRequired=assurance.data?.currentLevel!=='aal2';
  if(req.method==='GET'&&req.query.mode==='access')return res.json({owner:true,mfaRequired});
  if(mfaRequired)return res.status(403).json({error:'MFA_REQUIRED'});
  if(req.method==='GET'){
   const page=Number(req.query.page||0);
   if(!integer(page,0,100000))return res.status(400).json({error:'INVALID_FIELDS'});
   const result=await db.rpc('commerce_dashboard',{p_actor:actor,p_page:page});
   if(result.error)throw result.error;
   return res.json(result.data);
  }
  const body=req.body||{},dataToSave=payload(body);
  if(!dataToSave)return res.status(400).json({error:'INVALID_FIELDS'});
  const result=await db.rpc('commerce_update',{p_actor:actor,p_action:body.action,p_data:dataToSave});
  if(result.error)throw result.error;
  return res.json({ok:true});
 }catch(error){
  if(error.message==='NOT_AUTHORIZED')return res.status(403).json({error:error.message});
  if(error.message==='COMPANY_NOT_FOUND')return res.status(404).json({error:error.message});
  if(error.code==='23505')return res.status(409).json({error:'DUPLICATE_RECEIPT'});
  if(['LIMIT_BELOW_ALLOCATED','INVALID_EXTENSION','INVALID_PAID_PLAN','INVALID_TRIAL','INVALID_RECEIPT'].includes(error.message)){
   return res.status(400).json({error:error.message});
  }
  console.error('Platform owner request failed',{code:error.code||'OWNER_REQUEST_FAILED'});
  return res.status(500).json({error:'OWNER_REQUEST_FAILED'});
 }
}
