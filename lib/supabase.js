import { createClient } from '@supabase/supabase-js';

// Public browser credentials are safe to ship with the client; authorization is
// enforced by row-level policies. Environment values can override them per deployment.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uycntpxrfbqtxydhsbbi.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ltaNA7nnVozoSCOcZIjg';

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

export const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: sessionStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

export const isOnline = () => !!supabase;
