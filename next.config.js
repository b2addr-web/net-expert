/** @type {import('next').NextConfig} */
const scriptSource = process.env.NODE_ENV === 'development'
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
const securityTestUrl = process.env.NEXT_PUBLIC_SECURITY_TEST_SUPABASE_URL;
const localSecurityTest = process.env.NEXT_PUBLIC_SECURITY_TEST_MODE === '1'
  && /^http:\/\/127\.0\.0\.1:(55431|56431|57431)$/.test(securityTestUrl || '');
const localSource = localSecurityTest ? ` ${securityTestUrl}` : '';
const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSource,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://uycntpxrfbqtxydhsbbi.supabase.co${localSource}`,
  `connect-src 'self' https://uycntpxrfbqtxydhsbbi.supabase.co wss://uycntpxrfbqtxydhsbbi.supabase.co${localSource}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(localSecurityTest ? [] : ['upgrade-insecure-requests']),
].join('; ');

module.exports = {
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
