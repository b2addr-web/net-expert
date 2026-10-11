import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  if (!url || !publicKey) return res.status(503).json({ error: 'SERVER_AUTH_NOT_CONFIGURED' });
  const scoped = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await scoped.auth.getUser(token);
  if (authError || !authData.user) return res.status(401).json({ error: 'INVALID_SESSION' });
  const { data: access, error: accessError } = await scoped.rpc('get_my_access');
  if (accessError || access?.role !== 'company_admin') return res.status(403).json({ error: 'ADMIN_REQUIRED' });

  try {
    const userId = String(req.body?.userId || '');
    if (!userId || userId === authData.user.id) return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
    const { data: member } = await scoped.from('organization_members').select('user_id').eq('organization_id', access.organization_id).eq('user_id', userId).maybeSingle();
    if (!member) return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    const { error } = await scoped.rpc('admin_remove_member', { member_id: userId });
    if (error) throw error;
    return res.status(204).end();
  } catch (error) {
    console.error('Organization user operation failed', { message: error.message, code: error.code, status: error.status });
    return res.status(500).json({ error: 'USER_OPERATION_FAILED' });
  }
}

