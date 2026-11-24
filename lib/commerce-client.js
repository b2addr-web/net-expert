import {supabase} from './supabase';

export async function commerceRequest(query='',body){
 const {data}=await supabase.auth.getSession();
 const response=await fetch('/api/platform/owner'+query,{
  method:body?'POST':'GET',
  headers:{Authorization:'Bearer '+(data.session?.access_token||''),...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined
 });
 const result=await response.json();
 if(!response.ok)throw new Error(result.error||'OWNER_REQUEST_FAILED');
 return result;
}
