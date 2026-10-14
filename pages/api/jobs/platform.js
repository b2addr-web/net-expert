import {serverClient} from '../../../lib/intake-server';
import {runMonitorChecks,runSubscriptionAlerts} from '../../../lib/platform-jobs';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow',['GET']);return res.status(405).json({error:'METHOD_NOT_ALLOWED'})}
 const task=String(req.query.task||'');
 if(!['monitor','subscriptions'].includes(task))return res.status(404).json({error:'NOT_FOUND'});
 try{
  const candidate=req.headers['x-platform-token'];
  if(typeof candidate!=='string'||candidate.length<32||candidate.length>200)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const db=serverClient();
  const {data:authorized,error}=await db.rpc('verify_platform_job_token',{candidate});
  if(error||authorized!==true)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const result=task==='monitor'?await runMonitorChecks():await runSubscriptionAlerts();
  const {error:healthError}=await db.from('platform_job_runs').upsert({task,last_run_at:new Date().toISOString(),status:result.failed?'failed':'success',processed:result.processed??result.completed??0,error_code:result.failed?'PARTIAL_FAILURE':null});
  if(healthError)throw healthError;
  return res.status(200).json(result);
 }catch(error){console.error('Platform job failed',{task,code:error.code||'JOB_FAILED'});try{await serverClient().from('platform_job_runs').upsert({task,last_run_at:new Date().toISOString(),status:'failed',error_code:error.code||'JOB_FAILED'})}catch{}return res.status(500).json({error:'JOB_FAILED'})}
}
