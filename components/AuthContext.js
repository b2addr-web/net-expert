import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { storageGet, storageRemove, storageSet } from '../lib/browserStorage';

const AuthContext = createContext(null);
const recoveryGrantKey = 'ne_password_recovery_grant';
const recoveryGrantLifetime = 30 * 60 * 1000;
const readRecoveryGrant = () => {
  try {
    const grant = JSON.parse(storageGet('sessionStorage', recoveryGrantKey) || 'null');
    const age = Date.now() - grant?.createdAt;
    return grant?.userId && Number.isFinite(age) && age >= 0 && age < recoveryGrantLifetime ? grant.userId : null;
  } catch { return null; }
};
const saveRecoveryGrant = userId => storageSet('sessionStorage', recoveryGrantKey, JSON.stringify({ userId, createdAt: Date.now() }));
const clearRecoveryGrant = () => storageRemove('sessionStorage', recoveryGrantKey);

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const redirectUrl = path => {
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredSite && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    throw new Error('SITE_URL_NOT_CONFIGURED');
  }
  const origin = configuredSite ? new URL(configuredSite).origin : window.location.origin;
  return new URL(path, origin).toString();
};

const baseAccount = authUser => authUser ? {
  id: authUser.id,
  email: authUser.email,
  username: authUser.email,
  name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
  role: 'viewer',
  status: 'active',
  permissions: {},
  export_permissions: {},
  accountLoading: true,
} : null;

async function loadProfile(authUser, attempt = 0) {
  if (!supabase || !authUser) return null;
  const { data, error } = await supabase.from('profiles').select('id,email,full_name,department,role,status,created_at').eq('id', authUser.id).maybeSingle();
  if (error) {
    if (attempt < 3) { await wait(300 * (attempt + 1)); return loadProfile(authUser, attempt + 1); }
    throw error;
  }
  if (!data) {
    if (attempt < 3) {
      await wait(250 * (attempt + 1));
      return loadProfile(authUser, attempt + 1);
    }
    const { error: repairError } = await supabase.rpc('repair_my_account');
    if (repairError) throw repairError;
    return loadProfile(authUser, 0);
  }
  const { data: access, error: accessError } = await supabase.rpc('get_my_access');
  if (accessError) throw accessError;
  if (!access?.organization_id) {
    const { error: repairError } = await supabase.rpc('repair_my_account');
    if (repairError) throw repairError;
    if (attempt < 4) { await wait(300); return loadProfile(authUser, attempt + 1); }
    throw new Error('WORKSPACE_ACCESS_MISSING');
  }
  const { data: exportPermissions, error: exportError } = await supabase.rpc('get_my_export_permissions');
  if (exportError) console.warn('Export permissions could not be loaded:', exportError.message);
  const name = data?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0];
  return { ...(data || {}), ...(access || {}), id: authUser.id, email: authUser.email, name, username: authUser.email, role: access?.role || 'viewer', status: access?.status || data?.status || 'active', permissions: access?.permissions || {}, export_permissions: exportPermissions || {}, accountLoading: false };
}

async function recordEvent(event, details = {}) {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase.rpc('record_auth_event', { event_name: event, event_details: details });
  if (error) console.warn('Account audit event failed:', error.message);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [ready, setReady] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return undefined; }
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      const authUser = data?.session?.user;
      try {
        if (error) throw error;
        setUser(current => current && authUser && current.id === authUser.id && !current.accountLoading ? current : baseAccount(authUser));
        setRecoveryMode(Boolean(authUser && readRecoveryGrant() === authUser.id));
        if (authUser) {
          const profile = await loadProfile(authUser);
          if (active) { setUser(profile); setProfileError(null); }
        }
      } catch (sessionError) {
        console.error('Session initialization failed:', { message: sessionError.message, code: sessionError.code });
        // Do not discard a valid authenticated session because a secondary
        // profile/permission request was temporarily unavailable.
        if (active) {
          setUser(current => current && authUser && current.id === authUser.id && !current.accountLoading ? current : baseAccount(authUser));
          setProfileError(sessionError);
        }
      } finally { if (active) setReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user) { saveRecoveryGrant(session.user.id); setRecoveryMode(true); }
      if (event === 'SIGNED_OUT' || !session?.user) { clearRecoveryGrant(); setRecoveryMode(false); setUser(null); setProfileError(null); }
      else {
        setUser(current => current?.id === session.user.id ? current : baseAccount(session.user));
        window.setTimeout(() => {
          loadProfile(session.user).then(profile => { if (active) { setUser(profile); setProfileError(null); } }).catch(error => { console.error('Profile synchronization failed:', { message: error.message, code: error.code }); if (active) setProfileError(error); });
        }, 0);
      }
      setReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id || !user.organization_id || user.status !== 'active' || user.accountLoading || recoveryMode) return undefined;
    let active = true;
    let lastSent = 0;
    const markVisible = async () => {
      if (!active || document.visibilityState !== 'visible' || Date.now() - lastSent < 60000) return;
      lastSent = Date.now();
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active || !session?.access_token) return;
        await fetch('/api/organization/presence', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      } catch { /* Presence is optional and must not interrupt sign-in. */ }
    };
    markVisible();
    const timer = window.setInterval(markVisible, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', markVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', markVisible); };
  }, [user?.id, user?.organization_id, user?.status, user?.accountLoading, recoveryMode]);

  const retryProfile = async () => {
    const { data: { user: authUser }, error } = await supabase.auth.getUser();
    if (error || !authUser) { setUser(null); throw error || new Error('SESSION_EXPIRED'); }
    setProfileError(null);
    setUser(baseAccount(authUser));
    try { const profile = await loadProfile(authUser); setUser(profile); }
    catch (loadError) { setProfileError(loadError); throw loadError; }
  };

  const login = async (email, password, rememberMe) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    storageSet('localStorage', 'ne_remember_device', rememberMe ? '1' : '0');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { await recordEvent('login_failed', { code: error.code || 'unknown' }); throw error; }
    if (!data.session || !data.user) throw new Error('SESSION_NOT_CREATED');
    clearRecoveryGrant(); setRecoveryMode(false);
    setUser(baseAccount(data.user));
    let profile;
    try { profile = await loadProfile(data.user); }
    catch (profileError) {
      console.error('Authenticated, but account synchronization failed:', { message: profileError.message, code: profileError.code });
      throw profileError;
    }
    if (profile?.status === 'suspended') { await supabase.auth.signOut(); throw new Error('ACCOUNT_SUSPENDED'); }
    setUser(profile); await recordEvent('login_succeeded', { remember_device: !!rememberMe });
  };

  const signUp = async ({ fullName, organizationName, email, password }) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, organization_name: organizationName }, emailRedirectTo: redirectUrl('/') },
    });
    if (error) throw error;
    if (!data.user || data.user.identities?.length === 0) throw new Error('ACCOUNT_EXISTS');
    if (data.session) {
      const profile = await loadProfile(data.user);
      setUser(profile);
      await recordEvent('signup_succeeded');
    }
    return { confirmationRequired: !data.session };
  };

  const resendActivation = async (email) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectUrl('/') } });
    if (error) throw error;
  };

  const requestPasswordReset = async (email) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('/reset-password') });
    if (error) throw error;
  };

  const confirmEmailLink = async (tokenHash, type) => {
    if (!supabase || !tokenHash || !['recovery', 'invite'].includes(type)) throw new Error('RECOVERY_LINK_INVALID');
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data?.session?.user) throw new Error('RECOVERY_LINK_INVALID');
    saveRecoveryGrant(data.session.user.id);
    setRecoveryMode(true);
  };

  const updatePassword = async (password) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !authUser || readRecoveryGrant() !== authUser.id) throw new Error('RECOVERY_LINK_INVALID');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await recordEvent('password_changed');
    clearRecoveryGrant(); setRecoveryMode(false);
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
  };

  const refreshUsers = async () => {
    if (!supabase || user?.role !== 'company_admin') return [];
    const [{ data, error },{data: exports}] = await Promise.all([supabase.rpc('list_organization_members'),supabase.from('member_export_permissions').select('*')]);
    if (error) throw error;
    const normalized=(data||[]).map(x=>{const p=(exports||[]).find(v=>v.user_id===x.user_id);return{...x,id:x.user_id,export_permissions:p?{xlsx:p.can_export_excel,pdf:p.can_export_pdf,financial:p.can_export_financial}:{}}}); setUsers(normalized); return normalized;
  };

  const updateMember = async (id, changes) => {
    if (!supabase || user?.role !== 'company_admin') throw new Error('ADMIN_REQUIRED');
    const current=users.find(x=>x.id===id)||{};
    const { error } = await supabase.rpc('admin_update_member',{member_id:id,new_role:changes.role||current.role,new_status:changes.status||current.status,new_department:changes.department??current.department,access:changes.permissions||current.permissions||{}});
    if (error) throw error;
    setUsers(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  const organizationRequest = async (method, body) => {
    const { data:{ session } }=await supabase.auth.getSession();
    const response=await fetch('/api/organization/users',{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify(body)});
    if(!response.ok){const payload=await response.json().catch(()=>({}));const error=new Error(payload.message||payload.error||'USER_OPERATION_FAILED');error.code=payload.error;throw error;}
    return response.status===204?null:response.json();
  };
  const inviteUser=async input=>{
    if (!supabase || user?.role !== 'company_admin') throw new Error('ADMIN_REQUIRED');
    const {data,error}=await supabase.functions.invoke('invite-organization-user',{body:input});
    if(error){
      const payload=await error.context?.json?.().catch(()=>null);
      const failure=new Error(payload?.error||'INVITE_FAILED');
      failure.code=payload?.error;
      throw failure;
    }
    if(data?.error) throw new Error(data.error);
    await refreshUsers();
    return data;
  };
  const deleteUser=async id=>{await organizationRequest('DELETE',{userId:id});setUsers(items=>items.filter(x=>x.id!==id))};
  const updateExportPermissions=async(id,p)=>{if(user?.role!=='company_admin')throw new Error('ADMIN_REQUIRED');const{error}=await supabase.from('member_export_permissions').upsert({organization_id:user.organization_id,user_id:id,can_export_excel:!!p.xlsx,can_export_pdf:!!p.pdf,can_export_financial:!!p.financial},{onConflict:'organization_id,user_id'});if(error)throw error;setUsers(items=>items.map(x=>x.id===id?{...x,export_permissions:p}:x));await supabase.rpc('log_organization_event',{action_name:'export_permissions_updated',target_id:id,event_details:p})};

  const logout = async () => { await recordEvent('logout'); const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; setUser(null); };
  const logoutAll = async () => { await recordEvent('logout_all_sessions'); const { error } = await supabase.auth.signOut({ scope: 'global' }); if (error) throw error; setUser(null); };

  return <AuthContext.Provider value={{ user, users, ready, profileError, retryProfile, configured: !!supabase, recoveryMode, login, signUp, resendActivation, requestPasswordReset, confirmEmailLink, updatePassword, refreshUsers, updateMember, updateExportPermissions, inviteUser, deleteUser, logout, logoutAll }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

