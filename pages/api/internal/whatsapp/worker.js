import { timingSafeEqual } from 'node:crypto';
import {serviceSupabase} from '../../../../lib/serverSupabase';
import {processWhatsAppQueue} from '../../../../lib/whatsapp-worker';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const configured = process.env.WHATSAPP_WORKER_SECRET;
  const supplied = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(configured || '');
  if (!configured || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: 'WORKER_UNAUTHORIZED' });
  }
  if (req.query?.probe !== undefined) {
    const stagingMock = process.env.VERCEL_ENV === 'preview'
      && process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://bsxhmijczvsyidbgptfz.supabase.co'
      && process.env.WHATSAPP_PROVIDER === 'mock';
    if (req.query.probe !== 'auth' || !stagingMock) return res.status(403).json({ error: 'WORKER_PROBE_DISABLED' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ authenticated: true, processed: 0 });
  }
  try {
    const results = await processWhatsAppQueue(serviceSupabase(), undefined, Math.min(25, Math.max(1, Number(req.body?.limit) || 10)));
    return res.status(200).json({ results });
  } catch {
    return res.status(503).json({ error: 'WORKER_FAILED' });
  }
}
