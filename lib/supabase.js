import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase env vars missing — running in offline mode');
}

const sessionStorageAdapter = {
  getItem(key) {
    if (typeof window === 'undefined') return null;
    const remember = window.localStorage.getItem('ne_remember_device') === '1';
    return (remember ? window.localStorage : window.sessionStorage).getItem(key);
  },
  setItem(key, value) {
    if (typeof window === 'undefined') return;
    const remember = window.localStorage.getItem('ne_remember_device') === '1';
    (remember ? window.localStorage : window.sessionStorage).setItem(key, value);
  },
  removeItem(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: sessionStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isOnline = () => !!supabase;
