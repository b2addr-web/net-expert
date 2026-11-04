import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const productionOrigins = ['https://www.netexpert.dev', 'https://netexpert.dev'];

function appOrigins(apiUrl: string | undefined) {
  const api = new URL(apiUrl || 'https://invalid.example');
  // The local Supabase Edge Runtime reaches its API through the Docker host "kong".
  const local = api.protocol === 'http:' && ['127.0.0.1', 'localhost', 'kong'].includes(api.hostname);
  const allowed = new Set(productionOrigins);
  if (local) for (const origin of ['http://127.0.0.1:3000', 'http://127.0.0.1:3013', 'http://localhost:3000']) allowed.add(origin);
  for (const entry of (Deno.env.get('NETEXPERT_ALLOWED_APP_ORIGINS') || '').split(',').map(value => value.trim()).filter(Boolean)) {
    const parsed = new URL(entry);
    if (parsed.origin !== entry || parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)))) {
      throw new Error('INVALID_APP_ORIGIN_CONFIGURATION');
    }
    allowed.add(entry);
  }
  const destination = Deno.env.get('NETEXPERT_INVITE_REDIRECT_ORIGIN') || (local ? 'http://127.0.0.1:3000' : 'https://www.netexpert.dev');
  if (!allowed.has(destination)) throw new Error('INVITE_REDIRECT_NOT_ALLOWED');
  return { allowed, redirectTo: `${destination}/` };
}

function response(body: Record<string, unknown>, status: number, origin: string | null, allowedOrigins: Set<string>) {
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
  let destinations: ReturnType<typeof appOrigins>;
  try { destinations = appOrigins(Deno.env.get('SUPABASE_URL')); }
  catch { return new Response(JSON.stringify({ error: 'SERVER_REDIRECT_NOT_CONFIGURED' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
  const allowedOrigins = destinations.allowed;
  const reply = (body: Record<string, unknown>, status: number) => response(body, status, origin, allowedOrigins);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (req.method === 'OPTIONS') return reply({}, 200);
  if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'UNAUTHENTICATED' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'SERVER_AUTH_NOT_CONFIGURED' }, 503);

  const scoped = createClient(url, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await scoped.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: 'INVALID_SESSION' }, 401);
  const { data: access, error: accessError } = await scoped.rpc('get_my_access');
  if (accessError || access?.role !== 'company_admin' || !access.organization_id) {
    return reply({ error: 'ADMIN_REQUIRED' }, 403);
  }

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply({ error: 'INVALID_INPUT' }, 400); }
  const email = String(input.email || '').trim().toLowerCase();
  const fullName = String(input.fullName || '').trim();
  const role = input.role || 'viewer';
  const department = String(input.department || '').trim() || null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: 'INVALID_EMAIL' }, 400);
  if (role !== 'viewer' && role !== 'operator') return reply({ error: 'INVALID_ROLE' }, 400);
  if (fullName.length > 100 || (department && department.length > 100)) return reply({ error: 'INVALID_INPUT' }, 400);

  try {
    const { error: invitationError } = await scoped.from('organization_invitations').upsert({
      organization_id: access.organization_id,
      email,
      role,
      department,
      invited_by: authData.user.id,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'organization_id,email' });
    if (invitationError) throw invitationError;

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, invited_to_organization: access.organization_id },
      redirectTo: destinations.redirectTo,
    });
    if (error?.code === 'email_exists') {
      const { data: existing, error: addError } = await scoped.rpc('admin_add_existing_member', {
        invitee_email: email, invitee_role: role, invitee_department: department,
      });
      if (addError) {
        const known = ['ALREADY_MEMBER', 'ACCOUNT_NOT_CONFIRMED'].find(code => addError.message.includes(code));
        if (known) return reply({ error: known }, 409);
        throw addError;
      }
      return reply({ user: { id: existing.user_id, email, role, department }, delivery: 'existing_account' }, 200);
    }
    if (error) throw error;

    const { error: logError } = await scoped.rpc('log_organization_event', {
      action_name: 'member_invited', target_id: data.user?.id || null, event_details: { email, role, department },
    });
    if (logError) console.error('Invitation audit log failed', { code: logError.code });
    return reply({ user: { id: data.user?.id, email, role, department } }, 201);
  } catch (error) {
    const failure = error as { message?: string; code?: string; status?: number };
    console.error('Organization invitation failed', { message: failure.message, code: failure.code, status: failure.status });
    return reply({ error: 'INVITE_FAILED' }, 500);
  }
});
