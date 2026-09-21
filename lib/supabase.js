import { createClient } from '@supabase/supabase-js';

// Public browser credentials are safe to ship with the client; authorization is
// enforced by row-level policies. Never fall back to another environment's project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sessionStorageAdapter = {
  getItem(key) {
    if (typeof window === 'undefined') return null;
    const remember = window.localStorage.getItem('ne_remember_device') === '1';
    const preferred = remember ? window.localStorage : window.sessionStorage;
    const fallback = remember ? window.sessionStorage : window.localStorage;
    const value = preferred.getItem(key) || fallback.getItem(key);
    // A previous release could leave a valid session in the other store when
    // the Remember me preference changed. Migrate it instead of logging out.
    if (value && !preferred.getItem(key)) {
      preferred.setItem(key, value);
      fallback.removeItem(key);
    }
    return value;
  },
  setItem(key, value) {
    if (typeof window === 'undefined') return;
    const remember = window.localStorage.getItem('ne_remember_device') === '1';
    const preferred = remember ? window.localStorage : window.sessionStorage;
    const fallback = remember ? window.sessionStorage : window.localStorage;
    preferred.setItem(key, value);
    fallback.removeItem(key);
  },
  removeItem(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: sessionStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }) : null;

export const isOnline = () => isSupabaseConfigured;
