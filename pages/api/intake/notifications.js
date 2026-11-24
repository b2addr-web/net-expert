import {adminContext,canReadIntake,serverClient} from '../../../lib/intake-server';
import {intakeCaseLink,intakeNotificationTitle} from '../../../lib/intake-notifications';

export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(!['GET','PATCH'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  const context=await adminContext(req);
  if(!context)return res.status(403).json({error:'NOT_AUTHORIZED'});
  const db=serverClient(),org=context.organizationId,user=context.user.id;
  const kinds=['report','device_request'].filter(kind=>canReadIntake(context,kind));
  if(!kinds.length)return res.json({rows:[],unread:0});
  const scope=query=>query.eq('organization_id',org).eq('recipient_id',user).eq('show_in_bell',true);
  const settings=await db.from('intake_notification_settings').select('enabled,bell_enabled').eq('organization_id',org).maybeSingle();
  if(settings.error)throw settings.error;
  if(settings.data&&(!settings.data.enabled||!settings.data.bell_enabled))return res.json({rows:[],unread:0});
  if(req.method==='PATCH'){
   const {id,all}=req.body||{};
   if(all!==true&&(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))return res.status(400).json({error:'INVALID_FIELDS'});
   const result=await db.rpc('intake_read_notifications',{p_org:org,p_user:user,p_id:all===true?null:id});
   if(result.error)throw result.error;
   return res.json({ok:true});
  }
  const [list,count]=await Promise.all([
   scope(db.from('intake_notifications').select('id,event_key,created_at,read_at,intake_cases!inner(id,kind,reference,employee_name,department,issue_type,device_type)'))
    .in('intake_cases.kind',kinds).order('created_at',{ascending:false}).limit(30),
   scope(db.from('intake_notifications').select('id,intake_cases!inner(kind)',{head:true,count:'exact'}))
    .in('intake_cases.kind',kinds).is('read_at',null)
  ]);
  if(list.error||count.error)throw list.error||count.error;
  return res.json({unread:count.count,rows:list.data.map(x=>({
   id:x.id,kind:x.intake_cases.kind,event:x.event_key,createdAt:x.created_at,readAt:x.read_at,
   reference:x.intake_cases.reference,employee:x.intake_cases.employee_name,department:x.intake_cases.department,
   topic:x.intake_cases.issue_type||x.intake_cases.device_type,href:intakeCaseLink(x.intake_cases)
  }))});
 }catch(error){
  console.error('Intake inbox failed',{code:error.code||'INBOX_FAILED'});
  return res.status(500).json({error:'INBOX_FAILED'});
 }
}
