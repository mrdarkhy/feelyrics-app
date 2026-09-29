import 'server-only';
import {
  buildFallbackQuery,
  buildSearchQuery,
  matchTrack,
} from '@/domain/song/spotify-match';
import type { MatchQuery, MatchResult, TrackCandidate } from '@/domain/song/spotify-match';

/**
 * Spotify's catalogue, read server-side.
 *
 * Why this exists: the sync panel needs a track id, and until now a person had
 * to go to Spotify, find the song, copy the link and paste it back. That is four
 * steps between "translated" and "playing in sync", and the app already knows
 * the title and the artist.
 *
 * Which authorisation: the **Client Credentials** flow. It authenticates the
 * app, not a listener — no login, no redirect, no user token to refresh — and it
 * is enough because nothing here reads anybody's private data. The one thing it
 * cannot do is touch a user's library or playback, which this feature does not
 * need: the embed already handles playing.
 *
 * POLICY (Spotify's own words on the Search endpoint): "Spotify content may not
 * be used to train machine learning or AI models." Nothing from this module ever
 * reaches the transcreation engine. What crosses the boundary is a track
 * identity — id, name, artist, artwork, duration — used to line up a player.
 * Lyrics come from the person who pasted them and from nowhere else, which was
 * already the copyright line and is now also the AI-terms line.
 *
 * The credentials are read here rather than through `@/lib/env` on purpose: this
 * feature must degrade to "unavailable" instead of failing a build or a page
 * that has nothing to do with Spotify. No key configured is a normal state.
 */

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SEARCH_ENDPOINT = 'https://api.spotify.com/v1/search';

/**
 * Development Mode apps have a search `limit` ceiling of 10 since the February
 * 2026 changes (it used to be 50). Asking for more is an error, not a clamp on
 * Spotify's side, so the ceiling lives here.
 */
const MAX_LIMIT = 10;

/**
 * A market is not optional in practice: with neither a market parameter nor a
 * user country, Spotify considers the content unavailable and the search comes
 * back empty. `SPOTIFY_MARKET` overrides this.
 */
const DEFAULT_MARKET = 'TR';

/** Token lifetime is an hour; renew a minute early to avoid a race at the edge. */
const TOKEN_SAFETY_MS = 60_000;

/** Same song looked up twice in a day is the same answer. Keeps calls down. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

export type SpotifyFailure =
  | 'not_configured'
  | 'auth_failed'
  | 'rate_limited'
  | 'unavailable';

export type SpotifyLookup =
  | { readonly ok: true; readonly data: MatchResult }
  | { readonly ok: false; readonly code: SpotifyFailure; readonly retryAfter?: number };

interface Credentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly market: string;
}

function credentials(): Credentials | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const market = process.env.SPOTIFY_MARKET?.trim().toUpperCase();
  return {
    clientId,
    clientSecret,
    market: market && /^[A-Z]{2}$/.test(market) ? market : DEFAULT_MARKET,
  };
}

/** True when the app has Spotify credentials, so the UI can hide the button. */
export function isSpotifyCatalogConfigured(): boolean {
  return credentials() !== null;
}

// ── token ──

let token: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string | null> | null = null;

async function fetchToken(creds: Credentials): Promise<string | null> {
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      // A 400 here is almost always a wrong secret or an app that Development
      // Mode has switched off (since 9 March 2026 the app owner needs an active
      // Premium subscription). Say so in the log; the caller only learns that
      // auth failed.
      console.error(
        `[spotify] token request failed with ${response.status} — check SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET, and that the dashboard app is active`,
      );
      return null;
    }

    const payload = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };

    if (typeof payload.access_token !== 'string') return null;
    const lifetime =
      typeof payload.expires_in === 'number' ? payload.expires_in * 1000 : 3_600_000;

    token = {
      value: payload.access_token,
      expiresAt: Date.now() + lifetime - TOKEN_SAFETY_MS,
    };
    return token.value;
  } catch (error) {
    console.error('[spotify] token request threw', error);
    return null;
  }
}

async function accessToken(creds: Credentials, force = false): Promise<string | null> {
  if (force) token = null;
  if (token && token.expiresAt > Date.now()) return token.value;

  // Several concurrent lookups on a cold instance should mint one token, not one
  // each: the extra ones would all be accepted and all but the last discarded.
  tokenInFlight ??= fetchToken(creds).finally(() => {
    tokenInFlight = null;
  });

  return tokenInFlight;
}

// ── search ──

interface SpotifyArtist {
  readonly name?: unknown;
}

interface SpotifyImage {
  readonly url?: unknown;
  readonly width?: unknown;
}

interface SpotifyTrack {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly artists?: unknown;
  readonly album?: unknown;
  readonly duration_ms?: unknown;
  readonly popularity?: unknown;
}

function smallestImage(images: readonly SpotifyImage[]): string | null {
  const usable = images
    .filter((image): image is { url: string; width: number } =>
      typeof image.url === 'string' && typeof image.width === 'number',
    )
    .sort((a, b) => a.width - b.width);
  return usable[0]?.url ?? null;
}

/**
 * Maps one Spotify track to the domain's candidate shape, dropping anything
 * malformed. Only the fields the matcher and the UI need cross over — the rest
 * of Spotify's payload has no business in this app.
 */
function toCandidate(track: SpotifyTrack): TrackCandidate | null {
  if (typeof track.id !== 'string' || typeof track.name !== 'string') return null;

  const artists = Array.isArray(track.artists)
    ? (track.artists as SpotifyArtist[])
        .map((artist) => (typeof artist.name === 'string' ? artist.name : null))
        .filter((name): name is string => name !== null)
    : [];

  const album = (track.album ?? {}) as { name?: unknown; images?: unknown };

  return {
    id: track.id,
    name: track.name,
    artists,
    albumName: typeof album.name === 'string' ? album.name : '',
    durationMs: typeof track.duration_ms === 'number' ? track.duration_ms : 0,
    artworkUrl: Array.isArray(album.images)
      ? smallestImage(album.images as SpotifyImage[])
      : null,
    popularity: typeof track.popularity === 'number' ? track.popularity : 0,
  };
}

type SearchOutcome =
  | { readonly ok: true; readonly candidates: readonly TrackCandidate[] }
  | { readonly ok: false; readonly code: SpotifyFailure; readonly retryAfter?: number };

async function search(
  creds: Credentials,
  q: string,
  market: string,
  retryOn401 = true,
): Promise<SearchOutcome> {
  const bearer = await accessToken(creds);
  if (!bearer) return { ok: false, code: 'auth_failed' };

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'track');
  url.searchParams.set('market', market);
  url.searchParams.set('limit', String(MAX_LIMIT));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[spotify] search threw', error);
    return { ok: false, code: 'unavailable' };
  }

  // A token can be revoked before it expires; one silent renewal, then give up.
  if (response.status === 401 && retryOn401) {
    await accessToken(creds, true);
    return search(creds, q, market, false);
  }

  if (response.status === 429) {
    const header = Number(response.headers.get('Retry-After'));
    return {
      ok: false,
      code: 'rate_limited',
      retryAfter: Number.isFinite(header) ? header : 30,
    };
  }

  if (!response.ok) {
    console.error(`[spotify] search failed with ${response.status}`);
    return { ok: false, code: response.status === 403 ? 'auth_failed' : 'unavailable' };
  }

  const payload = (await response.json()) as { tracks?: { items?: unknown } };
  const items = Array.isArray(payload.tracks?.items)
    ? (payload.tracks.items as SpotifyTrack[])
    : [];

  return {
    ok: true,
    candidates: items
      .map(toCandidate)
      .filter((candidate): candidate is TrackCandidate => candidate !== null),
  };
}

// ── cache ──

const cache = new Map<string, { at: number; result: MatchResult }>();

function cacheKey(query: MatchQuery, market: string): string {
  return `${market}|${query.title.toLowerCase().trim()}|${query.artist.toLowerCase().trim()}`;
}

function readCache(key: string): MatchResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.result;
}

function writeCache(key: string, result: MatchResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), result });
}

// ── the one public call ──

/**
 * Finds the Spotify track for a song we already have.
 *
 * Two searches at most: the filtered one, then — only when it found nothing —
 * the plain one, because Spotify's `artist:` filter is exact enough to miss a
 * name spelled differently than the person typed it.
 */
export async function findTrack(
  query: MatchQuery,
  marketOverride?: string,
): Promise<SpotifyLookup> {
  const creds = credentials();
  if (!creds) return { ok: false, code: 'not_configured' };

  const market =
    marketOverride && /^[A-Za-z]{2}$/.test(marketOverride)
      ? marketOverride.toUpperCase()
      : creds.market;

  const key = cacheKey(query, market);
  const cached = readCache(key);
  if (cached) return { ok: true, data: cached };

  const filtered = await search(creds, buildSearchQuery(query), market);
  if (!filtered.ok) return filtered;

  let candidates = filtered.candidates;

  if (candidates.length === 0) {
    const plain = await search(creds, buildFallbackQuery(query), market);
    if (!plain.ok) return plain;
    candidates = plain.candidates;
  }

  const result = matchTrack(query, candidates);
  writeCache(key, result);
  return { ok: true, data: result };
}
