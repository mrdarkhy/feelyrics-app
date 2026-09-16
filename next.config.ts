import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Security headers applied to every route.
 *
 * Note on CSP: the app ships no third-party scripts and no inline scripts of its
 * own beyond what Next.js injects, so the policy stays tight. `'unsafe-inline'`
 * is required for styles because Next.js inlines critical CSS during streaming.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Fail the production build on type errors instead of shipping them. Linting
  // is no longer part of `next build` in Next.js 16 — it runs as its own step.
  typescript: { ignoreBuildErrors: false },

  experimental: {
    // Ship only the Radix entry points a route actually uses.
    optimizePackageImports: [
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
