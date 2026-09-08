import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

async function loadProfile(authUser) {
  if (!supabase || !authUser) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,department,role,status,created_at')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { id: authUser.id, email: authUser.email, role: 'viewer', status: 'pending_profile', profileIncomplete: true };
  return {
    ...data,
    name: data.full_name,
    username: data.email,
    profileIncomplete: !data.full_name || !data.department,
  };
}

async function recordAuthEvent(event, details = {}) {
  if (!supabase) return;
  try {
    await supabase.rpc('record_auth_event', { event_name: event, event_details: details });
  } catch {
    // Authentication must not fail because telemetry is temporarily unavailable.
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      try {
        setUser(await loadProfile(data.session?.user));
      } finally {
        if (active) setReady(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session?.user) setUser(null);
      else setUser(await loadProfile(session.user));
      setReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const requestOtp = async (email, rememberDevice) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    window.localStorage.setItem('ne_remember_device', rememberDevice ? '1' : '0');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
    await recordAuthEvent('otp_requested', { remember_device: !!rememberDevice });
  };

  const verifyOtp = async (email, token) => {
    if (!supabase) throw new Error('AUTH_NOT_CONFIGURED');
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      await recordAuthEvent('otp_failed');
      throw error;
    }
    const profile = await loadProfile(data.user);
    setUser(profile);
    await recordAuthEvent('login_succeeded');
    return profile;
  };

  const completeProfile = async ({ fullName, department }) => {
    if (!supabase || !user) throw new Error('AUTH_REQUIRED');
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email, full_name: fullName, department }, { onConflict: 'id' })
      .select('id,email,full_name,department,role,status,created_at')
      .single();
    if (error) throw error;
    const profile = { ...data, name: data.full_name, username: data.email, profileIncomplete: false };
    setUser(profile);
    await recordAuthEvent('profile_completed');
    return profile;
  };

  const logout = async () => {
    await recordAuthEvent('logout');
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      users: user ? [user] : [],
      ready,
      configured: !!supabase,
      requestOtp,
      verifyOtp,
      completeProfile,
      logout,
      addUser: () => Promise.reject(new Error('Use the administrator access workflow')),
      removeUser: () => Promise.reject(new Error('Use the administrator access workflow')),
      updatePassword: () => Promise.reject(new Error('Passwordless authentication is enabled')),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
