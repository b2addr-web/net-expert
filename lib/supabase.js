import { createClient } from '@supabase/supabase-js';
import { storageGet, storageSet, storageRemove } from './browserStorage';

import { supabaseUrl, supabaseKey } from './supabase-browser-config';
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
