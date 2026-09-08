/**
 * db.js — طبقة البيانات
 * إذا كان Supabase مُعدّاً → يحفظ في السحابة
 * إذا لم يكن → يحفظ في localStorage كـ fallback
 */
import { supabase } from './supabase';
import { INITIAL_DEVICES, INITIAL_USERS } from './data';

const LS = {
  get:    (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set:    (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  remove: (k)      => { try { localStorage.removeItem(k); } catch {} },
};

// ══════════════════════════════════════════════════════
//  DEVICES
// ══════════════════════════════════════════════════════

export async function getDevices() {
  if (supabase) {
    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) return data;
  }
  return LS.get('ne_devices', INITIAL_DEVICES);
}

export async function addDevice(device) {
  const row = { ...device, id: undefined, created_at: new Date().toISOString() };
  if (supabase) {
    const { data, error } = await supabase.from('devices').insert([row]).select().single();
    if (!error && data) {
      // sync local cache
      const local = LS.get('ne_devices', []);
      LS.set('ne_devices', [data, ...local]);
      return data;
    }
  }
  const newDev = { ...device, id: Date.now() };
  const local = LS.get('ne_devices', INITIAL_DEVICES);
  LS.set('ne_devices', [newDev, ...local]);
  return newDev;
}

export async function updateDevice(device) {
  if (supabase) {
    const { data, error } = await supabase
      .from('devices')
      .update({ ...device, updated_at: new Date().toISOString() })
      .eq('id', device.id)
      .select()
      .single();
    if (!error && data) {
      const local = LS.get('ne_devices', []);
      LS.set('ne_devices', local.map(d => d.id === data.id ? data : d));
      return data;
    }
  }
  const local = LS.get('ne_devices', INITIAL_DEVICES);
  const updated = local.map(d => d.id === device.id ? { ...device } : d);
  LS.set('ne_devices', updated);
  return device;
}

export async function deleteDevice(id) {
  if (supabase) {
    const { error } = await supabase.from('devices').delete().eq('id', id);
    if (!error) {
      const local = LS.get('ne_devices', []);
      LS.set('ne_devices', local.filter(d => d.id !== id));
      return true;
    }
  }
  const local = LS.get('ne_devices', INITIAL_DEVICES);
  LS.set('ne_devices', local.filter(d => d.id !== id));
  return true;
}

// ══════════════════════════════════════════════════════
//  USERS
// ══════════════════════════════════════════════════════

export async function getUsers() {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*');
    if (!error && data && data.length > 0) return data;
  }
  // ✅ دائماً يرجع INITIAL_USERS من الكود — مو من localStorage
  const local = LS.get('ne_users', null);
  // دمج المستخدمين المضافين يدوياً مع الأساسيين
  if (local) {
    const merged = [...INITIAL_USERS];
    local.forEach(u => {
      if (!merged.find(x => x.id === u.id)) merged.push(u);
    });
    return merged;
  }
  return INITIAL_USERS;
}

export async function loginUser(username, password) {
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();
    if (!error && data) return data;
  }
  // ✅ يتحقق من INITIAL_USERS أولاً (ثابتة في الكود على كل جهاز)
  const fromCode = INITIAL_USERS.find(u => u.username === username && u.password === password);
  if (fromCode) return fromCode;
  // ثم يتحقق من المستخدمين المضافين يدوياً في localStorage
  const local = LS.get('ne_users', []);
  return local.find(u => u.username === username && u.password === password) || null;
}

export async function addUser(user) {
  const row = { ...user, id: undefined };
  if (supabase) {
    const { data, error } = await supabase.from('users').insert([row]).select().single();
    if (!error && data) {
      const local = LS.get('ne_users', []);
      LS.set('ne_users', [...local, data]);
      return data;
    }
  }
  const newUser = { ...user, id: Date.now() };
  const local = LS.get('ne_users', INITIAL_USERS);
  LS.set('ne_users', [...local, newUser]);
  return newUser;
}

export async function removeUser(id) {
  if (supabase) {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (!error) {
      const local = LS.get('ne_users', []);
      LS.set('ne_users', local.filter(u => u.id !== id));
      return true;
    }
  }
  const local = LS.get('ne_users', INITIAL_USERS);
  LS.set('ne_users', local.filter(u => u.id !== id));
  return true;
}

export async function updateUser(id, fields) {
  if (supabase) {
    const { data, error } = await supabase.from('users').update(fields).eq('id', id).select().single();
    if (!error && data) {
      const local = LS.get('ne_users', []);
      LS.set('ne_users', local.map(u => u.id === id ? { ...u, ...fields } : u));
      return data;
    }
  }
  // في وضع localStorage: نجمع INITIAL_USERS مع أي مستخدمين مضافين
  const allUsers = await getUsers();
  const updated = allUsers.map(u => u.id === id ? { ...u, ...fields } : u);
  LS.set('ne_users', updated);
  return updated.find(u => u.id === id);
}

// ══════════════════════════════════════════════════════
//  AUDIT LOG
// ══════════════════════════════════════════════════════

export async function getAuditLog() {
  if (supabase) {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('time', { ascending: true });
    if (!error && data) return data;
  }
  return LS.get('ne_audit', []);
}

export async function addAuditEntry(entry) {
  if (supabase) {
    const { data, error } = await supabase.from('audit_log').insert([entry]).select().single();
    if (!error && data) {
      const local = LS.get('ne_audit', []);
      LS.set('ne_audit', [...local, data]);
      return data;
    }
  }
  const local = LS.get('ne_audit', []);
  const next = [...local, { ...entry, id: Date.now() }];
  LS.set('ne_audit', next);
  return entry;
}

// ══════════════════════════════════════════════════════
//  SESSION
// ══════════════════════════════════════════════════════

export function saveSession(user) {
  LS.set('ne_session', user);
}

export function loadSession() {
  return LS.get('ne_session', null);
}

export function clearSession() {
  LS.remove('ne_session');
}

// ══════════════════════════════════════════════════════
//  FINANCE
// ══════════════════════════════════════════════════════

export async function getFinance(table) {
  if (supabase) {
    const { data, error } = await supabase.from(table).select('*').order('date', { ascending: false });
    if (!error && data) return data;
  }
  return LS.get(`ne_${table}`, []);
}

export async function addFinanceRecord(table, record) {
  const row = { ...record, id: undefined, created_at: new Date().toISOString() };
  if (supabase) {
    const { data, error } = await supabase.from(table).insert([row]).select().single();
    if (!error && data) {
      const local = LS.get(`ne_${table}`, []);
      LS.set(`ne_${table}`, [data, ...local]);
      return data;
    }
  }
  const newRec = { ...record, id: Date.now() };
  const local = LS.get(`ne_${table}`, []);
  LS.set(`ne_${table}`, [newRec, ...local]);
  return newRec;
}

export async function updateFinanceRecord(table, record) {
  if (supabase) {
    const { data, error } = await supabase.from(table).update(record).eq('id', record.id).select().single();
    if (!error && data) {
      const local = LS.get(`ne_${table}`, []);
      LS.set(`ne_${table}`, local.map(r => r.id === data.id ? data : r));
      return data;
    }
  }
  const local = LS.get(`ne_${table}`, []);
  LS.set(`ne_${table}`, local.map(r => r.id === record.id ? record : r));
  return record;
}

export async function deleteFinanceRecord(table, id) {
  if (supabase) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) {
      const local = LS.get(`ne_${table}`, []);
      LS.set(`ne_${table}`, local.filter(r => r.id !== id));
      return true;
    }
  }
  const local = LS.get(`ne_${table}`, []);
  LS.set(`ne_${table}`, local.filter(r => r.id !== id));
  return true;
}
