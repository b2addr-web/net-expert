/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
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
