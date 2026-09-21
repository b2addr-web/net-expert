import { createClient } from '@supabase/supabase-js';

// This publishable browser configuration belongs to the Net Expert project.
// Environment values still take precedence in managed deployments. Authorization
// remains enforced by Supabase Auth and row-level security; no secret key is used.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://uycntpxrfbqtxydhsbbi.supabase.co';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_0bJpwk2KMJukl1twAELQZw_qFjVSe-k';

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
