import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import type { Song } from '@/domain/song/song';
import type { SongRequest, RequestStatus } from '@/domain/request/song-request';
import type {
  Suggestion,
  SuggestionStatus,
  ValidatedSuggestion,
} from '@/domain/suggestion/suggestion';
import type { ValidatedRequest } from '@/domain/request/song-request';

/**
 * Ports: what the application needs from the outside world, stated as
 * interfaces it owns.
 *
 * The dependency arrow points inward — Drizzle implements these, they do not
 * describe Drizzle. That is what lets the use cases be tested against in-memory
 * fakes, and what would let the store move to another engine without the
 * business rules noticing.
 */

export interface SongFilter {
  readonly source?: LanguageCode;
  readonly target?: TargetLanguage;
  /** Free-text match on title and artist. */
  readonly query?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SongSummary {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  readonly source: LanguageCode;
  readonly target: TargetLanguage;
  readonly feelProfile: string | null;
  readonly requestedBy: string | null;
  readonly validatedBy: string | null;
  readonly lineCount: number;
  readonly updatedAt: Date;
}

export interface SongRepository {
  /**
   * Summaries for the library. Carries no lyric lines at all, so listing pages
   * cannot leak a body even by accident.
   */
  listSummaries(filter: SongFilter): Promise<readonly SongSummary[]>;

  /** Every slug, for the sitemap and static generation. */
  listSlugs(): Promise<readonly string[]>;

  /**
   * The complete song, lyrics included.
   *
   * Callers must be able to justify full access: a share-link encoder, the
   * maintainer area, the seed importer. Public pages go through the use case
   * that applies the minimal-quote projection, never through this directly.
   */
  findFullBySlug(slug: string): Promise<Song | null>;

  findFullById(id: string): Promise<Song | null>;

  /** Replaces the rendering of one line, used when a suggestion is accepted. */
  updateLineRendering(lineId: string, rendering: string): Promise<void>;

  countAll(): Promise<number>;
}

export interface RequestFilter {
  readonly status?: RequestStatus;
  readonly includeDeclined?: boolean;
  readonly limit?: number;
}

export interface RequestRepository {
  list(filter: RequestFilter): Promise<readonly SongRequest[]>;
  findById(id: string): Promise<SongRequest | null>;
  create(input: ValidatedRequest): Promise<SongRequest>;
  save(request: SongRequest): Promise<SongRequest>;
  /** Guards against the same song being asked for twice in a row. */
  findRecentDuplicate(
    title: string,
    artist: string,
    withinMs: number,
  ): Promise<SongRequest | null>;
  countSince(since: Date): Promise<number>;
}

export interface SuggestionFilter {
  readonly songId?: string;
  readonly status?: SuggestionStatus;
  readonly limit?: number;
}

export interface SuggestionRepository {
  list(filter: SuggestionFilter): Promise<readonly Suggestion[]>;
  findById(id: string): Promise<Suggestion | null>;
  create(input: ValidatedSuggestion): Promise<Suggestion>;
  save(suggestion: Suggestion): Promise<Suggestion>;
  countForLineSince(lineId: string, since: Date): Promise<number>;
}

/**
 * Crude abuse control for unauthenticated writes.
 *
 * Deliberately an interface: the first implementation counts rows in Postgres,
 * which is fine at this size and needs no extra service. If volume ever makes
 * that the wrong answer, the swap is one adapter.
 */
export interface RateLimiter {
  /** Returns true when the action is allowed, and records it. */
  check(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
