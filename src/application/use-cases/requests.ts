import { domainError, err, ok, isErr } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import {
  compareForQueue,
  transition,
  validateNewRequest,
} from '@/domain/request/song-request';
import type {
  NewRequestInput,
  RequestStatus,
  SongRequest,
} from '@/domain/request/song-request';
import type {
  Clock,
  RateLimiter,
  RequestFilter,
  RequestRepository,
} from '../ports/repositories';

export interface RequestsPort {
  readonly requests: RequestRepository;
  readonly rateLimiter: RateLimiter;
  readonly clock: Clock;
}

/** One person may add this many requests per window. */
export const REQUEST_RATE_LIMIT = 5;
export const REQUEST_RATE_WINDOW_MS = 60 * 60 * 1000;

/** How long the same title+artist counts as a duplicate rather than a new ask. */
const DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function listQueue(
  deps: RequestsPort,
  filter: RequestFilter = {},
): Promise<readonly SongRequest[]> {
  const rows = await deps.requests.list({
    ...filter,
    limit: Math.min(filter.limit ?? 100, 200),
  });
  return [...rows].sort(compareForQueue);
}

export interface SubmitRequestCommand extends NewRequestInput {
  /** Stable per-submitter key — a hashed IP, never the address itself. */
  readonly submitterKey: string;
}

/**
 * Accepts a request from the public form.
 *
 * Three things happen in order, and the order is the point: validate before
 * touching the database, rate-limit before writing, and fold a duplicate into
 * the existing row rather than growing the queue with the same song twice.
 */
export async function submitRequest(
  deps: RequestsPort,
  command: SubmitRequestCommand,
): Promise<Result<SongRequest>> {
  const validated = validateNewRequest(command);
  if (isErr(validated)) return validated;

  const allowed = await deps.rateLimiter.check(
    `request:${command.submitterKey}`,
    REQUEST_RATE_LIMIT,
    REQUEST_RATE_WINDOW_MS,
  );
  if (!allowed) {
    return err(
      domainError('rate_limited', 'too many requests from this submitter'),
    );
  }

  const duplicate = await deps.requests.findRecentDuplicate(
    validated.value.title,
    validated.value.artist,
    DUPLICATE_WINDOW_MS,
  );

  if (duplicate) {
    // Somebody already asked. If this asker brought the lyrics and the original
    // request was still waiting for them, that unblocks it — the request moves
    // forward instead of a second identical row appearing in the queue.
    if (validated.value.hasLyrics && duplicate.status === 'lyrics-needed') {
      const moved = transition(duplicate, 'queued');
      if (isErr(moved)) return moved;
      return ok(await deps.requests.save(moved.value));
    }
    return ok(duplicate);
  }

  return ok(await deps.requests.create(validated.value));
}

export interface UpdateRequestStatusCommand {
  readonly id: string;
  readonly status: RequestStatus;
  readonly songSlug?: string | null;
}

/** Maintainer action. Authorisation is the caller's responsibility. */
export async function updateRequestStatus(
  deps: RequestsPort,
  command: UpdateRequestStatusCommand,
): Promise<Result<SongRequest>> {
  const existing = await deps.requests.findById(command.id);
  if (!existing) return err(domainError('not_found', 'no such request'));

  const moved = transition(existing, command.status, command.songSlug);
  if (isErr(moved)) return moved;

  return ok(await deps.requests.save(moved.value));
}

/**
 * Requests received in the last seven days — the leading indicator the growth
 * plan tracks, because a request is a person asking for something before they
 * have any reason to trust the answer.
 */
export async function weeklyRequestCount(deps: RequestsPort): Promise<number> {
  const since = new Date(deps.clock.now().getTime() - 7 * 24 * 60 * 60 * 1000);
  return deps.requests.countSince(since);
}
