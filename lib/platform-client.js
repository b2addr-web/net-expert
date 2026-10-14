import {supabase} from './supabase';

export async function platformRequest(section,method='GET',body=null,query=''){
 const {data,error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!data.session?.access_token)throw new Error('AUTH_REQUIRED');
 const response=await fetch(`/api/platform/${section}${query}`,{method,headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const value=await response.json().catch(()=>({error:'OPERATION_FAILED'}));
 if(!response.ok)throw new Error(value.error||'OPERATION_FAILED');
 return value;
}

export const canManagePlatform=user=>['company_admin','operator','manager'].includes(user.role);
export const remainingDays=value=>value?Math.round((Date.parse(value.slice(0,10)+'T00:00:00Z')-Date.parse(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T00:00:00Z'))/86400000):null;
export const displayDate=(value,ar)=>value?new Date(value.slice(0,10)+'T00:00:00Z').toLocaleDateString(ar?'ar-SA':'en-GB',{timeZone:'UTC'}):'—';
