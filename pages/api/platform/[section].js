import {adminContext,serverClient} from '../../../lib/intake-server';
import {normalizeMonitorUrl} from '../../../lib/monitor-probe';

const tables={subscriptions:'service_subscriptions',monitoring:'monitor_sites',inventory:'inventory_items'};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||value.trim().length>0);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const money=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=999999999999.99&&Math.abs(Math.round(value*100)-value*100)<0.000001;
const optionalDate=value=>value===null||value===''||date(value);
const trimmed=value=>value.trim();

function parseInput(section,body){
 if(section==='subscriptions'){
  if(!text(body.name,160,true)||!text(body.provider,160,true)||!text(body.description??'',2000)||!date(body.start_date)||!date(body.end_date)||body.end_date<body.start_date||!money(body.cost)||typeof body.currency!=='string'||!/^[A-Z]{3}$/.test(body.currency)||!['monthly','yearly','custom'].includes(body.billing_cycle)||body.license_count!==null&&body.license_count!==undefined&&!integer(body.license_count,0,1000000)||!text(body.notes??'',3000)||typeof body.auto_renew!=='boolean')throw new Error('INVALID_FIELDS');
  return {name:trimmed(body.name),provider:trimmed(body.provider),description:body.description??'',start_date:body.start_date,end_date:body.end_date,cost:body.cost,currency:body.currency,billing_cycle:body.billing_cycle,license_count:body.license_count??null,notes:body.notes??'',auto_renew:body.auto_renew};
 }
 if(section==='inventory'){
  if(!text(body.name,160,true)||!text(body.category,100,true)||!text(body.brand,120,true)||!text(body.model??'',120)||!integer(body.quantity,0,100000000)||!integer(body.min_quantity,0,100000000)||!text(body.storage_location??'',160)||!text(body.sku??'',100)||!text(body.notes??'',3000))throw new Error('INVALID_FIELDS');
  return {name:trimmed(body.name),category:trimmed(body.category),brand:trimmed(body.brand),model:body.model??'',quantity:body.quantity,min_quantity:body.min_quantity,storage_location:body.storage_location??'',sku:trimmed(body.sku??'')||null,notes:body.notes??''};
 }
 if(section==='monitoring'){
  const parsed=normalizeMonitorUrl(body.url);
  if(!text(body.name,160,true)||!text(body.description??'',2000)||![5,10,15,30,60].includes(body.check_interval_minutes)||!integer(body.slow_threshold_ms,100,30000)||typeof body.enabled!=='boolean'||!text(body.hosting_provider??'',160)||!optionalDate(body.hosting_expires_on??null)||!optionalDate(body.domain_expires_manual??null))throw new Error('INVALID_FIELDS');
  return {name:trimmed(body.name),url:parsed.url,domain_name:parsed.domain,description:body.description??'',check_interval_minutes:body.check_interval_minutes,slow_threshold_ms:body.slow_threshold_ms,enabled:body.enabled,hosting_provider:body.hosting_provider??'',hosting_expires_on:body.hosting_expires_on||null,domain_expires_manual:body.domain_expires_manual||null};
 }
 throw new Error('INVALID_SECTION');
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const section=String(req.query.section||'');
 if(!tables[section])return res.status(404).json({error:'NOT_FOUND'});
 if(!['GET','POST','PATCH','DELETE'].includes(req.method)){res.setHeader('Allow',['GET','POST','PATCH','DELETE']);return res.status(405).json({error:'METHOD_NOT_ALLOWED'})}
 try{
  const access=await adminContext(req);
  if(!access||access.role!=='company_admin'&&access.permissions?.[section]!==true)return res.status(403).json({error:'NOT_AUTHORIZED'});
  if(req.method!=='GET'&&!['company_admin','operator','manager'].includes(access.role))return res.status(403).json({error:'NOT_AUTHORIZED'});
  const db=serverClient(),table=tables[section],org=access.organizationId;
  if(req.method==='GET'){
   if(section==='monitoring'&&req.query.id){
    if(!uuid(req.query.id))return res.status(400).json({error:'INVALID_ID'});
    const {data:site,error}=await db.from(table).select('*').eq('organization_id',org).eq('id',req.query.id).maybeSingle();
    if(error)throw error;if(!site)return res.status(404).json({error:'NOT_FOUND'});
    const since=new Date(Date.now()-30*86400000).toISOString();
    const [checks,incidents]=await Promise.all([
     db.from('monitor_checks').select('checked_at,result,http_status,response_ms,error_type').eq('organization_id',org).eq('site_id',site.id).gte('checked_at',since).order('checked_at',{ascending:false}).limit(10000),
     db.from('monitor_incidents').select('id,started_at,ended_at,duration_seconds,reason').eq('organization_id',org).eq('site_id',site.id).gte('started_at',since).order('started_at',{ascending:false}).limit(1000)
    ]);
    if(checks.error||incidents.error)throw checks.error||incidents.error;
    return res.status(200).json({site,checks:checks.data,incidents:incidents.data});
   }
   const {data,error}=await db.from(table).select('*').eq('organization_id',org).order('created_at',{ascending:false}).limit(1000);
   if(error)throw error;
   if(section==='subscriptions'){
    const {data:job}=await db.from('platform_job_runs').select('last_run_at,status').eq('task','subscriptions').maybeSingle();
    return res.status(200).json({items:data,job});
   }
   if(section!=='monitoring')return res.status(200).json({items:data});
   const {data:stats,error:statsError}=await db.from('monitor_site_statistics').select('*').eq('organization_id',org).limit(1000);
   if(statsError)throw statsError;
   const {data:job}=await db.from('platform_job_runs').select('last_run_at,status').eq('task','monitor').maybeSingle();
   return res.status(200).json({items:data,stats,job});
  }
  const body=req.body||{};
  if(req.method==='POST'){
   const payload=parseInput(section,body);
   const {data,error}=await db.from(table).insert({...payload,organization_id:org,created_by:access.user.id}).select('*').single();
   if(error){if(error.code==='23505')return res.status(409).json({error:'DUPLICATE_ITEM'});throw error}
   return res.status(201).json({item:data});
  }
  if(!uuid(body.id))return res.status(400).json({error:'INVALID_ID'});
  if(req.method==='DELETE'){
   const {data,error}=await db.from(table).delete().eq('organization_id',org).eq('id',body.id).select('id').maybeSingle();
   if(error)throw error;return data?res.status(200).json({ok:true}):res.status(404).json({error:'NOT_FOUND'});
  }
  if(!integer(body.version,1,2147483647))return res.status(400).json({error:'INVALID_VERSION'});
  const payload=parseInput(section,body);
  const {data,error}=await db.from(table).update({...payload,version:body.version+1,updated_at:new Date().toISOString(),...(section==='monitoring'&&payload.url?{last_checked_at:null,domain_checked_at:null,check_lease_until:null}:{} )}).eq('organization_id',org).eq('id',body.id).eq('version',body.version).select('*').maybeSingle();
  if(error){if(error.code==='23505')return res.status(409).json({error:'DUPLICATE_ITEM'});throw error}
  return data?res.status(200).json({item:data}):res.status(409).json({error:'RECORD_CHANGED'});
 }catch(error){
  if(['INVALID_FIELDS','INVALID_URL','INVALID_SECTION'].includes(error.message))return res.status(400).json({error:error.message});
  console.error('Platform operation failed',{section,code:error.code||'UNKNOWN'});
  return res.status(500).json({error:'OPERATION_FAILED'});
 }
}
