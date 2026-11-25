import {createClient} from '@supabase/supabase-js';
import {storageGet,storageSet,storageRemove} from './browserStorage';
import {supabaseUrl,supabaseKey} from './supabase-browser-config';

const memory=new Map();
const ownerStorage={
 getItem:key=>storageGet('sessionStorage',key)??memory.get(key)??null,
 setItem(key,value){if(storageSet('sessionStorage',key,value)){memory.delete(key)}else{memory.set(key,value)}},
 removeItem(key){storageRemove('sessionStorage',key);memory.delete(key)}
};
let client;
export function ownerClient() {
 if(!client)client=createClient(supabaseUrl,supabaseKey,{auth:{
  storageKey:'netexpert-owner-session',storage:ownerStorage,
  persistSession:true,autoRefreshToken:true,detectSessionInUrl:false
 }});
 return client;
}

export async function commerceRequest(query='',body){
 const {data}=await ownerClient().auth.getSession();
 const response=await fetch('/api/platform/owner'+query,{
  method:body?'POST':'GET',
  headers:{Authorization:'Bearer '+(data.session?.access_token||''),...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined
 });
 const result=await response.json();
 if(!response.ok){
  const error=new Error(result.error||'OWNER_REQUEST_FAILED');
  if(typeof window!=='undefined'&&query!=='?mode=access'&&['NOT_AUTHORIZED','MFA_REQUIRED'].includes(error.message)) {
   window.dispatchEvent(new Event('netexpert-owner-access-changed'));
  }
  throw error;
 }
 return result;
}
