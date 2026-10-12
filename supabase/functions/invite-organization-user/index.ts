import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const allowedOrigins = new Set(['https://www.netexpert.dev', 'https://netexpert.dev']);

function response(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return response({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin);
  if (req.method === 'OPTIONS') return response({}, 200, origin);
  if (req.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405, origin);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return response({ error: 'UNAUTHENTICATED' }, 401, origin);
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
  if (!url || !publicKey || !serviceKey) return response({ error: 'SERVER_AUTH_NOT_CONFIGURED' }, 503, origin);

  const scoped = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await scoped.auth.getUser(token);
  if (authError || !authData.user) return response({ error: 'INVALID_SESSION' }, 401, origin);
  const { data: access, error: accessError } = await scoped.rpc('get_my_access');
  if (accessError || access?.role !== 'company_admin' || !access.organization_id) {
    return response({ error: 'ADMIN_REQUIRED' }, 403, origin);
  }

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return response({ error: 'INVALID_INPUT' }, 400, origin); }
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || '').trim();
  const role = input.role || 'viewer';
  const department = String(input.department || '').trim() || null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: 'INVALID_EMAIL' }, 400, origin);
  if (role !== 'viewer' && role !== 'operator') return response({ error: 'INVALID_ROLE' }, 400, origin);
  if (fullName.length > 100 || (department && department.length > 100)) return response({ error: 'INVALID_INPUT' }, 400, origin);

  try {
    const { error: invitationError } = await scoped.from('organization_invitations').upsert({
      organization_id: access.organization_id,
      email,
      role,
      department,
      invited_by: authData.user.id,
      status: 'pending',
    }, { onConflict: 'organization_id,email' });
    if (invitationError) throw invitationError;

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, invited_to_organization: access.organization_id },
      redirectTo: 'https://www.netexpert.dev/',
    });
    if (error?.code === 'email_exists') {
      const { data: existing, error: addError } = await scoped.rpc('admin_add_existing_member', {
        invitee_email: email, invitee_role: role, invitee_department: department,
      });
      if (addError) {
        const known = ['ALREADY_MEMBER', 'ACCOUNT_NOT_CONFIRMED'].find(code => addError.message.includes(code));
        if (known) return response({ error: known }, 409, origin);
        throw addError;
      }
      return response({ user: { id: existing.user_id, email, role, department }, delivery: 'existing_account' }, 200, origin);
    }
    if (error) throw error;

    const { error: logError } = await scoped.rpc('log_organization_event', {
      action_name: 'member_invited', target_id: data.user?.id || null, event_details: { email, role, department },
    });
    if (logError) console.error('Invitation audit log failed', { code: logError.code });
    return response({ user: { id: data.user?.id, email, role, department } }, 201, origin);
  } catch (error) {
    const failure = error as { message?: string; code?: string; status?: number };
    console.error('Organization invitation failed', { message: failure.message, code: failure.code, status: failure.status });
    return response({ error: 'INVITE_FAILED' }, 500, origin);
  }
});
