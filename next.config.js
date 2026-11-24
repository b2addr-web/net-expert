/** @type {import('next').NextConfig} */
const scriptSource = process.env.NODE_ENV === 'development'
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
const productionOrigin = 'https://uycntpxrfbqtxydhsbbi.supabase.co';
const production = process.env.VERCEL_ENV === 'production';
const isolated = !production && (process.env.VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_INTAKE_ISOLATED === '1');
const previewRef = process.env.INTAKE_PREVIEW_SUPABASE_REF;
const previewOrigin = /^[a-z]{20}$/.test(previewRef || '') ? 'https://' + previewRef + '.supabase.co' : null;
if (isolated && (!previewOrigin || previewOrigin === productionOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL !== previewOrigin)) {
  throw new Error('Intake Preview requires the isolated NetExpert staging database URL.');
}
if (production && process.env.NEXT_PUBLIC_SUPABASE_URL !== productionOrigin) {
  throw new Error('The production build requires the NetExpert production database URL.');
}
const databaseOrigin = isolated ? previewOrigin : productionOrigin;
const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSource,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: " + databaseOrigin,
  "connect-src 'self' " + databaseOrigin + ' ' + databaseOrigin.replace('https:', 'wss:'),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

module.exports = {
  env: { NEXT_PUBLIC_INTAKE_ISOLATED: isolated ? '1' : '0' },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },{
      source: '/auth/confirm',
      headers: [
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    }];
  },
  webpack(config, { dev }) {
    // The Windows production builder can stall while snapshotting the shared
    // runtime dependency tree. Production deployments build cleanly without
    // relying on this local filesystem cache.
    if (!dev) config.cache = false;
    return config;
  },
}
