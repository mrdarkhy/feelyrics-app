import { domainError, err, ok, isErr } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import {
  reviewSuggestion,
  validateNewSuggestion,
} from '@/domain/suggestion/suggestion';
import type {
  NewSuggestionInput,
  PreferencePair,
  Suggestion,
  SuggestionStatus,
} from '@/domain/suggestion/suggestion';
import { toPreferencePair } from '@/domain/suggestion/suggestion';
import type {
  Clock,
  RateLimiter,
  SongRepository,
  SuggestionFilter,
  SuggestionRepository,
} from '../ports/repositories';

export interface SuggestionsPort {
  readonly suggestions: SuggestionRepository;
  readonly songs: SongRepository;
  readonly rateLimiter: RateLimiter;
  readonly clock: Clock;
}

export const SUGGESTION_RATE_LIMIT = 20;
export const SUGGESTION_RATE_WINDOW_MS = 60 * 60 * 1000;

/** Suggestions one line may collect per hour before it looks like a brigade. */
const PER_LINE_LIMIT = 10;
const PER_LINE_WINDOW_MS = 60 * 60 * 1000;

export async function listSuggestions(
  deps: SuggestionsPort,
  filter: SuggestionFilter = {},
): Promise<readonly Suggestion[]> {
  return deps.suggestions.list({
    ...filter,
    limit: Math.min(filter.limit ?? 100, 200),
  });
}

export interface SubmitSuggestionCommand extends NewSuggestionInput {
  readonly submitterKey: string;
}

export async function submitSuggestion(
  deps: SuggestionsPort,
  command: SubmitSuggestionCommand,
): Promise<Result<Suggestion>> {
  const validated = validateNewSuggestion(command);
  if (isErr(validated)) return validated;

  const allowed = await deps.rateLimiter.check(
    `suggestion:${command.submitterKey}`,
    SUGGESTION_RATE_LIMIT,
    SUGGESTION_RATE_WINDOW_MS,
  );
  if (!allowed) {
    return err(domainError('rate_limited', 'too many suggestions from this submitter'));
  }

  const since = new Date(deps.clock.now().getTime() - PER_LINE_WINDOW_MS);
  const recentOnLine = await deps.suggestions.countForLineSince(
    validated.value.lineId,
    since,
  );
  if (recentOnLine >= PER_LINE_LIMIT) {
    return err(domainError('rate_limited', 'this line has had enough suggestions for now'));
  }

  return ok(await deps.suggestions.create(validated.value));
}

export interface ReviewSuggestionCommand {
  readonly id: string;
  readonly status: SuggestionStatus;
  readonly reviewNote?: string | null;
}

/**
 * Maintainer review.
 *
 * Accepting is not just a status change — it rewrites the line, which is what
 * makes the community model real: the reader who landed it better actually
 * changes what the next reader sees.
 */
export async function reviewSuggestionUseCase(
  deps: SuggestionsPort,
  command: ReviewSuggestionCommand,
): Promise<Result<Suggestion>> {
  const existing = await deps.suggestions.findById(command.id);
  if (!existing) return err(domainError('not_found', 'no such suggestion'));

  const reviewed = reviewSuggestion(existing, command.status, command.reviewNote);
  if (isErr(reviewed)) return reviewed;

  if (command.status === 'accepted') {
    await deps.songs.updateLineRendering(
      existing.lineId,
      existing.proposedRendering,
    );
  }

  return ok(await deps.suggestions.save(reviewed.value));
}

/**
 * Every accepted suggestion as a preference pair.
 *
 * This is the export the business case rests on, so it lives in the application
 * layer as a first-class use case rather than as a reporting script somebody
 * writes later from raw SQL.
 */
export async function exportPreferencePairs(
  deps: SuggestionsPort,
): Promise<readonly PreferencePair[]> {
  const accepted = await deps.suggestions.list({ status: 'accepted', limit: 200 });
  return accepted
    .map(toPreferencePair)
    .filter((pair): pair is PreferencePair => pair !== null);
}
