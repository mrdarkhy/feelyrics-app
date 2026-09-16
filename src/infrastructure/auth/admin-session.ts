import 'server-only';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';

/**
 * Maintainer authentication.
 *
 * One shared token, exchanged for a signed session cookie. No sign-up, no
 * password reset, no third-party identity provider — the maintainer area has one
 * user, and making him create an account somewhere to reach his own backlog
 * would be ceremony without security.
 *
 * The contributor side stays anonymous by design: leaving a better line must not
 * require an account, because the first contribution is where people are lost.
 * When a trust ladder is eventually needed, it slots in beside this rather than
 * replacing it — which is why everything below is behind one small interface.
 */

const COOKIE_NAME = 'feelyrics_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

/** Constant-time comparison, so a wrong guess leaks nothing through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  return Buffer.from(signature).toString('base64url');
}

/**
 * Exchanges the shared token for a session.
 * Returns false on a bad token without saying which part was wrong.
 */
export async function createAdminSession(token: string): Promise<boolean> {
  const secret = serverEnv().ADMIN_TOKEN;
  if (!secret) return false;
  if (!safeEqual(token, secret)) return false;

  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = String(expiresAt);
  const signature = await sign(payload, secret);

  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  return true;
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Whether the current request carries a valid maintainer session.
 *
 * When `ADMIN_TOKEN` is unset the answer is always false: an unconfigured
 * deployment locks the maintainer area rather than opening it.
 */
export async function isAdmin(): Promise<boolean> {
  const secret = serverEnv().ADMIN_TOKEN;
  if (!secret) return false;

  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return false;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return false;

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  const expected = await sign(payload, secret);
  if (!safeEqual(signature, expected)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/** Guard for maintainer-only server actions and routes. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error('FORBIDDEN');
  }
}
