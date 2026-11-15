import crypto from 'node:crypto';
import {serviceSupabase} from './serverSupabase.js';

const key=()=>{const value=process.env.WHATSAPP_CREDENTIALS_KEY;if(!value)throw new Error('WHATSAPP_CREDENTIALS_NOT_CONFIGURED');return crypto.createHash('sha256').update(value).digest()};
export function encryptWhatsAppSecret(secret){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const body=Buffer.concat([cipher.update(String(secret),'utf8'),cipher.final()]);return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`}
export function decryptWhatsAppSecret(payload){const [version,ivText,tagText,bodyText]=String(payload||'').split('.');if(version!=='v1')throw new Error('WHATSAPP_CREDENTIAL_FORMAT');const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(ivText,'base64url'));decipher.setAuthTag(Buffer.from(tagText,'base64url'));return Buffer.concat([decipher.update(Buffer.from(bodyText,'base64url')),decipher.final()]).toString('utf8')}

export class MockWhatsAppProvider{
  async sendTemplate({to,idempotencyKey}){return {providerMessageId:`mock-${crypto.createHash('sha256').update(`${to}:${idempotencyKey}`).digest('hex').slice(0,24)}`,status:'accepted'}}
}
export class MetaWhatsAppProvider{
  async sendTemplate(){throw new Error('META_PROVIDER_DISABLED')}
}
export function whatsappProvider(){return process.env.WHATSAPP_PROVIDER==='meta'?new MetaWhatsAppProvider():new MockWhatsAppProvider()}

export async function enqueueWhatsAppJob({organizationId,signatureRequestId}){
  const db=serviceSupabase();const idempotencyKey=`signature:${signatureRequestId}`;
  const {data:settings}=await db.from('whatsapp_settings').select('mode,account_id,enabled,template_status,recipient_consent_required').eq('organization_id',organizationId).maybeSingle();
  const accountId=settings?.mode==='company'?settings.account_id:null;
  const {data:job,error}=await db.from('whatsapp_send_jobs').upsert({organization_id:organizationId,signature_request_id:signatureRequestId,account_id:accountId,idempotency_key:idempotencyKey,status:'pending'},{onConflict:'signature_request_id'}).select('id,status').single();
  if(error)throw error;return {job,enabled:Boolean(settings?.enabled&&settings?.template_status==='approved'),consentRequired:settings?.recipient_consent_required!==false};
}
