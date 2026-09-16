import 'server-only';

/**
 * A stable per-submitter key for rate limiting.
 *
 * The raw IP address is never stored. It is salted with a per-deployment secret
 * and hashed, so the ledger can tell "same person as a minute ago" without
 * holding anything that identifies who that person is. Losing the ledger would
 * leak nothing.
 *
 * Behind Vercel the client address arrives in `x-forwarded-for`; the first entry
 * is the original client and the rest are proxies.
 */
export async function submitterKey(requestHeaders: Headers): Promise<string> {
  const forwarded = requestHeaders.get('x-forwarded-for');
  const realIp = requestHeaders.get('x-real-ip');
  const address = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';

  // Any deployment secret works as a salt; the admin token is one that always
  // exists in a configured deployment, and a fixed fallback keeps local
  // development running without one.
  const salt = process.env.ADMIN_TOKEN ?? 'feelyrics-local-salt';

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${address}`),
  );

  return Buffer.from(digest).toString('base64url').slice(0, 24);
}
