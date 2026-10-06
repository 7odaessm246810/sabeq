import path from 'node:path';
import type { NextConfig } from 'next';

/** Where this app forwards `/api/v1/*` (ADR-0004). In Docker this is the internal service URL. */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  transpilePackages: ['@sabeq/ui'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternalUrl}/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
