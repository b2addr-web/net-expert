import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function loadProfile(authUser, attempt = 0) {
  if (!supabase || !authUser) return null;
  const { data, error } = await supabase.from('profiles').select('id,email,full_name,department,role,status,created_at').eq('id', authUser.id).maybeSingle();
  if (error) throw error;
  if (!data) {
    if (attempt < 2) {
      await wait(250 * (attempt + 1));
      return loadProfile(authUser, attempt + 1);
    }
    const { data: created, error: createError } = await supabase.from('profiles').upsert({
      id: authUser.id,
      email: authUser.email,
      full_name: authUser.user_metadata?.full_name || null,
      role: 'viewer',
      status: 'active',
    }, { onConflict: 'id' }).select('id,email,full_name,department,role,status,created_at').single();
    if (createError) throw createError;
    return { ...created, name: created.full_name || created.email?.split('@')[0], username: created.email };
  }
  const name = data?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0];
  return { ...(data || {}), id: authUser.id, email: authUser.email, name, username: authUser.email, role: data?.role || 'viewer', status: data?.status || 'active' };
}

async function recordEvent(event, details = {}) {
  if (!supabase) return;
  const { error } = await supabase.rpc('record_auth_event', { event_name: event, event_details: details });
  if (error) console.warn('Account audit event failed:', error.message);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return undefined; }
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      try {
        if (error) throw error;
        setUser(await loadProfile(data.session?.user));
      } catch (sessionError) {
        console.error('Session initialization failed:', sessionError);
        setUser(null);
      } finally { if (active) setReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT' || !session?.user) setUser(null);
      else window.setTimeout(() => {
        loadProfile(session.user).then(profile => { if (active) setUser(profile); }).catch(profileError => console.error('Profile synchronization failed:', profileError));
      }, 0);
      setReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const login = async (email, password, rememberMe) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    window.localStorage.setItem('ne_remember_device', rememberMe ? '1' : '0');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { await recordEvent('login_failed', { code: error.code || 'unknown' }); throw error; }
    const profile = await loadProfile(data.user);
    if (profile?.status === 'suspended') { await supabase.auth.signOut(); throw new Error('ACCOUNT_SUSPENDED'); }
    setUser(profile); await recordEvent('login_succeeded', { remember_device: !!rememberMe });
  };

  const signUp = async ({ fullName, email, password }) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
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
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
  };

  const requestPasswordReset = async (email) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw error;
  };

  const updatePassword = async (password) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setRecoveryMode(false); await recordEvent('password_changed');
  };

  const refreshUsers = async () => {
    if (!supabase || user?.role !== 'admin') return [];
    const { data, error } = await supabase.from('profiles').select('id,email,full_name,department,role,status,created_at').order('created_at', { ascending: false });
    if (error) throw error;
    setUsers(data || []); return data || [];
  };

  const updateUserRole = async (id, role) => {
    if (!supabase || user?.role !== 'admin') throw new Error('ADMIN_REQUIRED');
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) throw error;
    setUsers(current => current.map(item => item.id === id ? { ...item, role } : item));
    await recordEvent('user_role_changed', { target_user_id: id, role });
  };

  const logout = async () => { await recordEvent('logout'); const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; setUser(null); };
  const logoutAll = async () => { await recordEvent('logout_all_sessions'); const { error } = await supabase.auth.signOut({ scope: 'global' }); if (error) throw error; setUser(null); };

  return <AuthContext.Provider value={{ user, users, ready, configured: !!supabase, recoveryMode, login, signUp, resendActivation, requestPasswordReset, updatePassword, refreshUsers, updateUserRole, logout, logoutAll }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
