import { and, count, eq, gte, lt } from 'drizzle-orm';
import type { Database } from '../client';
import { rateLimitEvents } from '../schema';
import type { RateLimiter } from '@/application/ports/repositories';

/**
 * Rate limiting on top of Postgres.
 *
 * A sliding window counted from an append-only ledger. It is not the fastest
 * possible implementation and does not pretend to be atomic under heavy
 * contention — two simultaneous requests can both read a count just under the
 * limit and both be allowed. For deterring casual abuse of an unauthenticated
 * form that is an acceptable trade, and it costs no extra service.
 *
 * Failures are swallowed on purpose: a rate limiter that takes the whole form
 * down when the ledger has a bad minute has made the problem worse.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: Database) {}

  async check(key: string, limit: number, windowMs: number): Promise<boolean> {
    const since = new Date(Date.now() - windowMs);

    try {
      const [row] = await this.db
        .select({ value: count() })
        .from(rateLimitEvents)
        .where(
          and(
            eq(rateLimitEvents.bucketKey, key),
            gte(rateLimitEvents.occurredAt, since),
          ),
        );

      if (Number(row?.value ?? 0) >= limit) return false;

      await this.db.insert(rateLimitEvents).values({ bucketKey: key });

      // Opportunistic cleanup: roughly one write in twenty pays to sweep rows
      // that can no longer affect any window, so the ledger does not grow
      // without bound and no cron job is needed.
      if (Math.random() < 0.05) {
        await this.db
          .delete(rateLimitEvents)
          .where(lt(rateLimitEvents.occurredAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
      }

      return true;
    } catch (error) {
      console.error('[rate-limit] ledger unavailable, allowing request', error);
      return true;
    }
  }
}

/** In-memory limiter for tests and for local runs without a database. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  async check(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const recent = (this.buckets.get(key) ?? []).filter(
      (at) => at > now - windowMs,
    );

    if (recent.length >= limit) {
      this.buckets.set(key, recent);
      return false;
    }

    recent.push(now);
    this.buckets.set(key, recent);
    return true;
  }
}
