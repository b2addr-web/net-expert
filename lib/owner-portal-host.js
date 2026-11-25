export const ownerPortalHost = 'admin.netexpert.dev';

export function isOwnerPortalHost(host) {
 return String(host || '').toLowerCase().replace(/:\d+$/, '') === ownerPortalHost;
}

export function ownerPortalEnabled(host) {
 if (isOwnerPortalHost(host)) return true;
 const ref = process.env.INTAKE_PREVIEW_SUPABASE_REF;
 return process.env.VERCEL_ENV === 'preview' && /^[a-z]{20}$/.test(ref || '') &&
  ref !== 'uycntpxrfbqtxydhsbbi' && process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://' + ref + '.supabase.co';
}
