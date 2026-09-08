import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

async function loadProfile(authUser) {
  if (!supabase || !authUser) return null;
  const { data, error } = await supabase.from('profiles').select('id,email,full_name,department,role,status,created_at').eq('id', authUser.id).maybeSingle();
  if (error) throw error;
  const name = data?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0];
  return { ...(data || {}), id: authUser.id, email: authUser.email, name, username: authUser.email, role: data?.role || 'viewer', status: data?.status || 'active' };
}

async function recordEvent(event, details = {}) {
  if (!supabase) return;
  try { await supabase.rpc('record_auth_event', { event_name: event, event_details: details }); } catch { /* Audit telemetry must not block access. */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return undefined; }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      try { setUser(await loadProfile(data.session?.user)); } finally { if (active) setReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (event === 'SIGNED_OUT' || !session?.user) setUser(null);
      else setUser(await loadProfile(session.user));
      setReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const login = async (email, password, rememberMe) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    window.localStorage.setItem('ne_remember_device', rememberMe ? '1' : '0');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { await recordEvent('login_failed'); throw error; }
    const profile = await loadProfile(data.user);
    if (profile?.status === 'suspended') { await supabase.auth.signOut(); throw new Error('ACCOUNT_SUSPENDED'); }
    setUser(profile); await recordEvent('login_succeeded', { remember_device: !!rememberMe });
  };

  const signUp = async ({ fullName, email, password }) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    if (data.session) setUser(await loadProfile(data.user));
    return { confirmationRequired: !data.session };
  };

  const resendActivation = async (email) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
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

  const logout = async () => { await recordEvent('logout'); if (supabase) await supabase.auth.signOut({ scope: 'local' }); setUser(null); };
  const logoutAll = async () => { await recordEvent('logout_all_sessions'); if (supabase) await supabase.auth.signOut({ scope: 'global' }); setUser(null); };

  return <AuthContext.Provider value={{ user, users, ready, configured: !!supabase, recoveryMode, login, signUp, resendActivation, requestPasswordReset, updatePassword, refreshUsers, updateUserRole, logout, logoutAll }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

