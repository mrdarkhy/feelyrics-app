import { NextResponse } from 'next/server';
import { extractLyrics } from '@/domain/lyrics/extract';
import { MAX_LYRICS_LENGTH } from '@/domain/lyrics/extract';
import { InMemoryRateLimiter } from '@/infrastructure/db/repositories/rate-limiter';

/**
 * Lyric structuring.
 *
 * Pure computation on a string: no database, no filesystem, nothing stored. The
 * words arrive, come back with a shape, and are gone — which is both the privacy
 * posture and the copyright one. This service has no lyric corpus because it
 * never keeps what it is shown.
 *
 * A note on where this runs. The obvious home for a stateless string transform
 * is the edge, and an earlier version of this file declared `runtime = 'edge'`.
 * Next.js 16 deprecates that runtime, and on Vercel the Node runtime under Fluid
 * compute now gives the same cold-start behaviour with none of the edge
 * runtime's constraints — no partial Web-API surface, no separate bundle, and no
 * migration to do when the deprecated runtime is removed. So this is a Node
 * route that happens to touch nothing, which is the cheap kind anyway.
 */
export const runtime = 'nodejs';

/**
 * The response depends only on the request body, so there is nothing to cache
 * and nothing that benefits from a warm instance holding state.
 */
export const dynamic = 'force-dynamic';

/**
 * Rate limiting here is per-instance and in-memory rather than in Postgres: this
 * endpoint writes nothing, so the worst case for a miss is wasted compute, and
 * opening a database connection to guard a pure function would cost more than
 * the abuse it prevents. It is a speed bump, not a wall.
 */
const limiter = new InMemoryRateLimiter();
const LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;

interface ExtractRequestBody {
  lyrics?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const forwarded = request.headers.get('x-forwarded-for');
  const key = forwarded?.split(',')[0]?.trim() ?? 'unknown';

  if (!(await limiter.check(key, LIMIT, WINDOW_MS))) {
    return NextResponse.json(
      { ok: false, code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  let body: ExtractRequestBody;
  try {
    body = (await request.json()) as ExtractRequestBody;
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_input' }, { status: 400 });
  }

  if (typeof body.lyrics !== 'string') {
    return NextResponse.json(
      { ok: false, code: 'invalid_input', field: 'lyrics' },
      { status: 400 },
    );
  }

  if (body.lyrics.length > MAX_LYRICS_LENGTH) {
    return NextResponse.json(
      { ok: false, code: 'invalid_input', field: 'lyrics' },
      { status: 413 },
    );
  }

  const result = extractLyrics(body.lyrics);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.error.code, field: result.error.field },
      { status: 422 },
    );
  }

  return NextResponse.json(
    { ok: true, data: result.value },
    {
      status: 200,
      headers: {
        // A response derived entirely from the request body, about content we do
        // not keep, must never be cached by anything in between.
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, code: 'invalid_input', detail: 'Use POST with a JSON body.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
