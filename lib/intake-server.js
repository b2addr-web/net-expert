import {createClient} from '@supabase/supabase-js';
import {createHash,randomBytes,randomInt,createCipheriv,createDecipheriv} from 'node:crypto';

export const REPORT_STATUSES=['جديد','قيد المعالجة','بانتظار إجراء','تم الحل','مغلق'];
export const REQUEST_STATUSES=['جديد','قيد المراجعة','بانتظار الموافقة','تمت الموافقة','مرفوض','قيد التجهيز','تم التسليم','مغلق'];
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
export const newShortCode=()=>Array.from({length:22},()=>"0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"[randomInt(62)]).join('');
const encryptionKey=()=>{if(!process.env.INTAKE_LINK_SECRET)throw new Error('SERVER_NOT_CONFIGURED');return createHash('sha256').update(process.env.INTAKE_LINK_SECRET).digest()};
export function sealToken(token){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64url')).join('.');}
export function openToken(value){const [iv,tag,encrypted]=String(value).split('.').map(x=>Buffer.from(x,'base64url'));const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');}
export const serverClient=()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('SERVER_NOT_CONFIGURED');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
};
export async function adminContext(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!token||!url||!key)return null;
 const scoped=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await scoped.auth.getUser(token);
 if(authError||!auth.user)return null;
 const {data:access,error}=await scoped.rpc('get_my_access');
 if(error||access?.status!=='active'||!access?.organization_id)return null;
 return {user:auth.user,organizationId:access.organization_id,role:access.role,permissions:access.permissions||{}};
}
export const canReadIntake=(context,kind)=>Boolean(context&&['report','device_request'].includes(kind)&&(context.role==='company_admin'||context.permissions?.[kind]===true));
export const canWriteIntake=(context,kind)=>canReadIntake(context,kind)&&['company_admin','operator','manager'].includes(context.role);
export const validText=(value,max=200)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max;
export const emailValid=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function validateSubmission(kind,body){
 const common=['employee_name','employee_number','department'];
 if(!common.every(key=>validText(body?.[key],key==='employee_number'?50:120))||!emailValid(body?.email)||!validText(body?.description,3000))return false;
 return kind==='report'?validText(body?.issue_type,120):kind==='device_request'?validText(body?.device_type,120):false;
}
export async function sendCaseEmail({to,reference,kind,status}){
 const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL;
 if(!key||!from)return {sent:false,reason:'EMAIL_NOT_CONFIGURED'};
 const item=kind==='report'?'البلاغ':'طلب الجهاز';
 const subject=`NetExpert — ${kind==='report'?'بلاغ':'طلب جهاز'} ${reference}`;
 const content=status==='جديد'?`تم استلام ${item} رقم ${reference}. سنطلعك على أي تغيير في حالته.`:`تم تحديث حالة ${item} رقم ${reference} إلى: ${status}.`;
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to,subject,text:content})});
 if(!response.ok){console.error('Resend email failed',{status:response.status});return {sent:false,reason:'EMAIL_DELIVERY_FAILED'};}
 return {sent:true};
}
