import 'server-only';
import { getDb } from './db/client';
import { DrizzleSongRepository } from './db/repositories/song.repository';
import { DrizzleRequestRepository } from './db/repositories/request.repository';
import { DrizzleSuggestionRepository } from './db/repositories/suggestion.repository';
import { PostgresRateLimiter } from './db/repositories/rate-limiter';
import { engineFromEnv } from './engine/anthropic-engine';
import type { TranscreationEngine } from '@/application/ports/engine';
import { systemClock } from '@/application/ports/repositories';
import type {
  Clock,
  RateLimiter,
  RequestRepository,
  SongRepository,
  SuggestionRepository,
} from '@/application/ports/repositories';

/**
 * Composition root.
 *
 * The only place in the app where an interface is tied to a concrete adapter.
 * Everything above this file depends on the ports; swapping Drizzle for
 * something else is an edit here and nowhere else.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a runtime surprise with a database URL in the browser bundle.
 */

export interface Container {
  readonly songs: SongRepository;
  readonly requests: RequestRepository;
  readonly suggestions: SuggestionRepository;
  readonly rateLimiter: RateLimiter;
  readonly clock: Clock;
  /** Null when no API key is configured — "Translate now" then reports engine_unavailable. */
  readonly engine: TranscreationEngine | null;
}

let cached: Container | null = null;

export function getContainer(): Container {
  if (cached) return cached;

  const db = getDb();

  cached = {
    songs: new DrizzleSongRepository(db),
    requests: new DrizzleRequestRepository(db),
    suggestions: new DrizzleSuggestionRepository(db),
    rateLimiter: new PostgresRateLimiter(db),
    clock: systemClock,
    engine: engineFromEnv(),
  };

  return cached;
}
