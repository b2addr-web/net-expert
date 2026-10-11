import { createClient } from '@supabase/supabase-js';
import { storageGet, storageSet, storageRemove } from './browserStorage';

// This publishable browser configuration belongs to the Net Expert project.
// Environment values still take precedence in managed deployments. Authorization
// remains enforced by Supabase Auth and row-level security; no secret key is used.
// Pin the browser client to the Net Expert project so stale deployment
// variables cannot override the valid public configuration.
const supabaseUrl = 'https://uycntpxrfbqtxydhsbbi.supabase.co';
const supabaseKey = 'sb_publishable_0bJpwk2KMJukl1twAELQZw_qFjVSe-k';
const volatileSessions = new Map();

const sessionStorageAdapter = {
  getItem(key) {
    if (typeof window === 'undefined') return null;
    const remember = storageGet('localStorage', 'ne_remember_device') === '1';
    const preferred = remember ? 'localStorage' : 'sessionStorage';
    const fallback = remember ? 'sessionStorage' : 'localStorage';
    const value = storageGet(preferred, key) || storageGet(fallback, key) || volatileSessions.get(key);
    // A previous release could leave a valid session in the other store when
    // the Remember me preference changed. Migrate it instead of logging out.
    if (value && !storageGet(preferred, key)) {
      if (storageSet(preferred, key, value)) {
        storageRemove(fallback, key);
        volatileSessions.delete(key);
      } else if (!remember) {
        volatileSessions.set(key, value);
        storageRemove('localStorage', key);
      }
    }
    return value;
  },
  setItem(key, value) {
    if (typeof window === 'undefined') return;
    const remember = storageGet('localStorage', 'ne_remember_device') === '1';
    const preferred = remember ? 'localStorage' : 'sessionStorage';
    const fallback = remember ? 'sessionStorage' : 'localStorage';
    if (storageSet(preferred, key, value)) {
      storageRemove(fallback, key);
      volatileSessions.delete(key);
    } else if (remember && storageSet(fallback, key, value)) {
      storageRemove(preferred, key);
      volatileSessions.delete(key);
    } else {
      volatileSessions.set(key, value);
      storageRemove('localStorage', key);
    }
  },
  removeItem(key) {
    if (typeof window === 'undefined') return;
    storageRemove('localStorage', key);
    storageRemove('sessionStorage', key);
    volatileSessions.delete(key);
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
