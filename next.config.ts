import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // PGlite (WASM) and sharp (native) must be loaded by Node, not bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'sharp', 'pg'],
  experimental: {
    serverActions: { bodySizeLimit: '16mb' }, // KYC image + up to 3 screenshots
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
