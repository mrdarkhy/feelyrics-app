import { domainError, err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { isTargetLanguage } from '../shared/language';
import type { TargetLanguage } from '../shared/language';

/**
 * A request for a song to be feel-translated.
 *
 * The request queue is the product's front door as much as its backlog: the
 * asker's name stays on the song when it lands, which gives them a reason to
 * come back and a reason to tell somebody. That is why `requesterAlias` is part
 * of the entity rather than an analytics field.
 */

export const REQUEST_STATUSES = [
  /** Nobody has pasted the lyrics yet, so nothing can be translated. */
  'lyrics-needed',
  /** Lyrics are in hand; the song is waiting its turn. */
  'queued',
  /** Translated and published. */
  'ready',
  /** Not going to happen — duplicate, or out of scope. */
  'declined',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return (
    typeof value === 'string' &&
    (REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

export interface SongRequest {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly targets: readonly TargetLanguage[];
  /** Public credit. Null when the asker preferred not to leave a name. */
  readonly requesterAlias: string | null;
  /** Whether lyrics came with the request. Drives the initial status. */
  readonly hasLyrics: boolean;
  readonly status: RequestStatus;
  /** Set once the translation is published. */
  readonly songSlug: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Legal transitions. A request cannot jump from `lyrics-needed` to `ready`:
 * something has to supply the lyrics first, and making that impossible to skip
 * in code is how the user-paste rule stays true under deadline pressure.
 */
const ALLOWED_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  'lyrics-needed': ['queued', 'declined'],
  queued: ['ready', 'lyrics-needed', 'declined'],
  ready: ['queued'],
  declined: ['lyrics-needed', 'queued'],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transition(
  request: SongRequest,
  to: RequestStatus,
  songSlug?: string | null,
): Result<SongRequest> {
  if (request.status === to) return ok(request);

  if (!canTransition(request.status, to)) {
    return err(
      domainError(
        'invalid_transition',
        `cannot move a request from ${request.status} to ${to}`,
        'status',
      ),
    );
  }

  if (to === 'ready' && !songSlug) {
    return err(
      domainError(
        'invalid_transition',
        'a request can only be marked ready once it points at a published song',
        'songSlug',
      ),
    );
  }

  return ok({
    ...request,
    status: to,
    songSlug: songSlug === undefined ? request.songSlug : songSlug,
    updatedAt: new Date(),
  });
}

export const MAX_TITLE_LENGTH = 160;
export const MAX_ARTIST_LENGTH = 160;
export const MAX_ALIAS_LENGTH = 60;
export const MAX_TARGETS = 4;

export interface NewRequestInput {
  readonly title: string;
  readonly artist: string;
  readonly targets: readonly string[];
  readonly requesterAlias?: string | null;
  readonly hasLyrics?: boolean;
}

export interface ValidatedRequest {
  readonly title: string;
  readonly artist: string;
  readonly targets: readonly TargetLanguage[];
  readonly requesterAlias: string | null;
  readonly hasLyrics: boolean;
  readonly status: RequestStatus;
}

/**
 * Validates a request from the public form.
 *
 * `status` is derived here rather than accepted from the caller: whether a
 * request needs lyrics is a fact about the request, not a choice the submitter
 * gets to make.
 */
export function validateNewRequest(
  input: NewRequestInput,
): Result<ValidatedRequest> {
  const title = input.title?.trim() ?? '';
  const artist = input.artist?.trim() ?? '';

  if (title.length === 0) {
    return err(domainError('invalid_input', 'title is required', 'title'));
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return err(domainError('invalid_input', 'title is too long', 'title'));
  }
  if (artist.length === 0) {
    return err(domainError('invalid_input', 'artist is required', 'artist'));
  }
  if (artist.length > MAX_ARTIST_LENGTH) {
    return err(domainError('invalid_input', 'artist is too long', 'artist'));
  }

  const targets = [...new Set(input.targets.map((t) => t.toLowerCase()))].filter(
    isTargetLanguage,
  );

  if (targets.length === 0) {
    return err(
      domainError('unsupported_language', 'pick at least one target language', 'targets'),
    );
  }
  if (targets.length > MAX_TARGETS) {
    return err(domainError('invalid_input', 'too many target languages', 'targets'));
  }

  const alias = input.requesterAlias?.trim() ?? '';
  const hasLyrics = input.hasLyrics === true;

  return ok({
    title,
    artist,
    targets,
    requesterAlias: alias.length > 0 ? alias.slice(0, MAX_ALIAS_LENGTH) : null,
    hasLyrics,
    status: hasLyrics ? 'queued' : 'lyrics-needed',
  });
}

/**
 * Ordering for the public queue: things a reader can open first, then things
 * that are moving, then things that need somebody to act. Within a group, newest
 * first — a queue whose top never changes stops being worth revisiting.
 */
const STATUS_WEIGHT: Record<RequestStatus, number> = {
  ready: 0,
  queued: 1,
  'lyrics-needed': 2,
  declined: 3,
};

export function compareForQueue(a: SongRequest, b: SongRequest): number {
  const byStatus = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  if (byStatus !== 0) return byStatus;
  return b.createdAt.getTime() - a.createdAt.getTime();
}
