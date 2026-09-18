import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export default async function handler(req, res) {
  if (!url || !publicKey || !serviceKey || !siteUrl) return res.status(503).json({ error: 'SERVER_AUTH_NOT_CONFIGURED' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  const scoped = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await scoped.auth.getUser(token);
  if (authError || !authData.user) return res.status(401).json({ error: 'INVALID_SESSION' });
  const { data: access, error: accessError } = await scoped.rpc('get_my_access');
  if (accessError || access?.role !== 'company_admin') return res.status(403).json({ error: 'ADMIN_REQUIRED' });

  try {
    if (req.method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const role = req.body?.role || 'viewer';
      const department = String(req.body?.department || '').trim() || null;
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'INVALID_EMAIL' });
      if (!['company_admin', 'manager', 'operator', 'viewer'].includes(role)) return res.status(400).json({ error: 'INVALID_ROLE' });
      const { error: inviteRowError } = await scoped.from('organization_invitations').upsert({ organization_id: access.organization_id, email, role, department, invited_by: authData.user.id, status: 'pending' }, { onConflict: 'organization_id,email' });
      if (inviteRowError) throw inviteRowError;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: req.body?.fullName || '', invited_to_organization: access.organization_id }, redirectTo: new URL('/', siteUrl).toString() });
      if (error) throw error;
      await scoped.rpc('log_organization_event', { action_name: 'member_invited', target_id: data.user?.id || null, event_details: { email, role, department } });
      return res.status(201).json({ user: { id: data.user?.id, email, role, department } });
    }
    if (req.method === 'DELETE') {
      const userId = String(req.body?.userId || '');
      if (!userId || userId === authData.user.id) return res.status(400).json({ error: 'CANNOT_DELETE_SELF' });
      const { data: member } = await scoped.from('organization_members').select('user_id').eq('organization_id', access.organization_id).eq('user_id', userId).maybeSingle();
      if (!member) return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
      const { error } = await scoped.rpc('admin_remove_member', { member_id: userId });
      if (error) throw error;
      return res.status(204).end();
    }
    res.setHeader('Allow', ['POST', 'DELETE']);
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    console.error('Organization user operation failed', { message: error.message, code: error.code, status: error.status });
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    return res.status(status).json({ error: error.code || 'USER_OPERATION_FAILED' });
  }
}
