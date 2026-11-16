import { MockWhatsAppProvider } from '../lib/whatsapp.js';
import { processOneWhatsAppJob } from '../lib/whatsapp-worker.js';

export function processStagingFixtureJob(db, { organizationId, requestId, jobId }) {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (![organizationId, requestId, jobId].every(id => uuid.test(id ?? ''))) {
    throw new Error('Invalid fixture job identity');
  }
  return processOneWhatsAppJob(db, new MockWhatsAppProvider(), new Date(), (client, workerId, now) =>
    client.from('whatsapp_send_jobs')
      .update({
        status: 'processing', attempts: 1, lock_token: workerId,
        locked_until: new Date(now.getTime() + 90000).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', jobId)
      .eq('organization_id', organizationId)
      .eq('signature_request_id', requestId)
      .eq('status', 'pending')
      .eq('attempts', 0)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
      .select('*'));
}
