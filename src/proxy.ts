import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * Locale negotiation at the network boundary.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`; the export has to be named
 * `proxy` for the runtime to pick it up.
 */
export const proxy = createMiddleware(routing);

export const config = {
  /**
   * Everything except API routes, Next.js internals and files with an extension.
   * Locale-prefixing a request for `/icon.png` would 404 the icon.
   */
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
