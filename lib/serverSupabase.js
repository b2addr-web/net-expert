import {createClient} from '@supabase/supabase-js';
export function serviceSupabase(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('SERVER_AUTH_NOT_CONFIGURED');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
export const sha256Hex=async value=>{const data=typeof value==='string'?new TextEncoder().encode(value):value;const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')};
