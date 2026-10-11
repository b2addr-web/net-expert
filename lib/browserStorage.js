// Safari and privacy modes can deny access to browser storage altogether.
// Keep the current tab usable without assuming either storage API exists.
const memory = new Map();

export function storageGet(kind, key) {
  if (typeof window === 'undefined') return null;
  try { return window[kind]?.getItem(key) ?? memory.get(`${kind}:${key}`) ?? null; }
  catch { return memory.get(`${kind}:${key}`) ?? null; }
}

export function storageSet(kind, key, value) {
  if (typeof window === 'undefined') return false;
  memory.set(`${kind}:${key}`, String(value));
  try { window[kind]?.setItem(key, value); return Boolean(window[kind]); }
  catch { return false; }
}

export function storageRemove(kind, key) {
  if (typeof window === 'undefined') return;
  memory.delete(`${kind}:${key}`);
  try { window[kind]?.removeItem(key); } catch {}
}
