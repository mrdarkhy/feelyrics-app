import { NextResponse } from 'next/server';
import { findTrack, isSpotifyCatalogConfigured } from '@/infrastructure/spotify/spotify-catalog';
import { InMemoryRateLimiter } from '@/infrastructure/db/repositories/rate-limiter';

/**
 * "Which Spotify track is this song?"
 *
 * The browser asks by title and artist; the answer is a track id and, when the
 * match is not certain, the shortlist to choose from. The credentials never
 * leave the server, which is the whole reason this route exists rather than the
 * panel calling Spotify directly.
 *
 * Nothing is stored. The song's own row is not touched here: the chosen track
 * lives on the reader's device and inside the share link, the same place the
 * timings already live.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * In-memory, like `/api/extract`: this route writes nothing, so a miss costs one
 * upstream call rather than a row. The number is generous for a person trying a
 * few songs and mean for a script — Spotify's own rate limit is the wall behind
 * it, and the six-hour result cache means repeats never reach it at all.
 */
const limiter = new InMemoryRateLimiter();
const LIMIT = 40;
const WINDOW_MS = 60 * 60 * 1000;

const MAX_FIELD_LENGTH = 200;

interface LookupBody {
  title?: unknown;
  artist?: unknown;
  market?: unknown;
}

function field(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_FIELD_LENGTH) return null;
  return trimmed;
}

const STATUS: Record<string, number> = {
  not_configured: 503,
  auth_failed: 503,
  rate_limited: 429,
  unavailable: 502,
};

export async function POST(request: Request): Promise<NextResponse> {
  const forwarded = request.headers.get('x-forwarded-for');
  const key = forwarded?.split(',')[0]?.trim() ?? 'unknown';

  if (!(await limiter.check(key, LIMIT, WINDOW_MS))) {
    return NextResponse.json(
      { ok: false, code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '300' } },
    );
  }

  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_input' }, { status: 400 });
  }

  const title = field(body.title);
  if (!title) {
    return NextResponse.json(
      { ok: false, code: 'invalid_input', field: 'title' },
      { status: 400 },
    );
  }

  // An artist is optional — a song can be looked up by title alone — but the
  // matcher will never call that result confident.
  const artist = field(body.artist) ?? '';
  const market = typeof body.market === 'string' ? body.market : undefined;

  const lookup = await findTrack({ title, artist }, market);

  if (!lookup.ok) {
    return NextResponse.json(
      { ok: false, code: lookup.code },
      {
        status: STATUS[lookup.code] ?? 502,
        headers: lookup.retryAfter
          ? { 'Retry-After': String(lookup.retryAfter) }
          : undefined,
      },
    );
  }

  return NextResponse.json(
    { ok: true, data: lookup.data },
    {
      status: 200,
      headers: {
        // Catalogue metadata about a public track: a short private cache saves
        // a round trip when the reader reopens the panel, and holds nothing
        // about the reader.
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}

/** Whether the feature is switched on at all, so the panel can hide the button. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: true, data: { configured: isSpotifyCatalogConfigured() } },
    { status: 200, headers: { 'Cache-Control': 'private, max-age=600' } },
  );
}
