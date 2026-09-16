import { domainError, err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { normaliseTags } from '../song/reason-tag';
import type { ReasonTag } from '../song/reason-tag';

/**
 * A reader's alternative rendering of one line.
 *
 * Every accepted suggestion becomes a preference pair — engine draft rejected,
 * human rendering chosen, with the reason attached. That is the dataset the
 * whole project is built to produce, which is why the reason tag is mandatory
 * rather than encouraged: an untagged correction is an opinion, a tagged one is
 * training data.
 */

export const SUGGESTION_STATUSES = [
  /** Submitted, not yet looked at. */
  'proposed',
  /** A maintainer adopted it; the line now reads this way. */
  'accepted',
  /** Two people disagree; a curator has to rule. */
  'disputed',
  /** Considered and not adopted. Kept, because near-misses are data too. */
  'rejected',
] as const;

export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export function isSuggestionStatus(value: unknown): value is SuggestionStatus {
  return (
    typeof value === 'string' &&
    (SUGGESTION_STATUSES as readonly string[]).includes(value)
  );
}

export interface Suggestion {
  readonly id: string;
  readonly songId: string;
  readonly lineId: string;
  /** Snapshot of the line as it stood when the suggestion was made. */
  readonly originalLine: string;
  readonly engineDraft: string;
  readonly proposedRendering: string;
  readonly tags: readonly ReasonTag[];
  /** Optional free-text reasoning, capped short on purpose. */
  readonly comment: string | null;
  readonly contributorAlias: string | null;
  readonly status: SuggestionStatus;
  /** A curator's note when the call was not obvious. Itself expert annotation. */
  readonly reviewNote: string | null;
  readonly createdAt: Date;
  readonly reviewedAt: Date | null;
}

export const MAX_RENDERING_LENGTH = 400;
export const MAX_COMMENT_LENGTH = 280;
export const MAX_ALIAS_LENGTH = 60;

export interface NewSuggestionInput {
  readonly songId: string;
  readonly lineId: string;
  readonly originalLine: string;
  readonly engineDraft: string;
  readonly proposedRendering: string;
  readonly tags: readonly unknown[];
  readonly comment?: string | null;
  readonly contributorAlias?: string | null;
}

export interface ValidatedSuggestion {
  readonly songId: string;
  readonly lineId: string;
  readonly originalLine: string;
  readonly engineDraft: string;
  readonly proposedRendering: string;
  readonly tags: readonly ReasonTag[];
  readonly comment: string | null;
  readonly contributorAlias: string | null;
}

export function validateNewSuggestion(
  input: NewSuggestionInput,
): Result<ValidatedSuggestion> {
  const proposed = input.proposedRendering?.trim() ?? '';

  if (proposed.length === 0) {
    return err(
      domainError('invalid_input', 'a suggestion needs a rendering', 'proposedRendering'),
    );
  }
  if (proposed.length > MAX_RENDERING_LENGTH) {
    return err(
      domainError('invalid_input', 'rendering is too long', 'proposedRendering'),
    );
  }
  if (proposed === input.engineDraft?.trim()) {
    return err(
      domainError(
        'invalid_input',
        'the suggestion is identical to the current rendering',
        'proposedRendering',
      ),
    );
  }

  const tags = normaliseTags(input.tags);
  if (tags.length === 0) {
    return err(
      domainError('missing_reason_tag', 'pick at least one reason tag', 'tags'),
    );
  }

  if (!input.songId || !input.lineId) {
    return err(domainError('invalid_input', 'suggestion is not anchored to a line'));
  }

  const comment = input.comment?.trim() ?? '';
  const alias = input.contributorAlias?.trim() ?? '';

  return ok({
    songId: input.songId,
    lineId: input.lineId,
    originalLine: (input.originalLine ?? '').slice(0, MAX_RENDERING_LENGTH),
    engineDraft: (input.engineDraft ?? '').slice(0, MAX_RENDERING_LENGTH),
    proposedRendering: proposed,
    tags,
    comment: comment.length > 0 ? comment.slice(0, MAX_COMMENT_LENGTH) : null,
    contributorAlias: alias.length > 0 ? alias.slice(0, MAX_ALIAS_LENGTH) : null,
  });
}

const ALLOWED_TRANSITIONS: Record<SuggestionStatus, readonly SuggestionStatus[]> = {
  proposed: ['accepted', 'rejected', 'disputed'],
  disputed: ['accepted', 'rejected'],
  accepted: ['disputed'],
  rejected: ['proposed'],
};

export function reviewSuggestion(
  suggestion: Suggestion,
  status: SuggestionStatus,
  reviewNote?: string | null,
): Result<Suggestion> {
  if (!ALLOWED_TRANSITIONS[suggestion.status].includes(status)) {
    return err(
      domainError(
        'invalid_transition',
        `cannot move a suggestion from ${suggestion.status} to ${status}`,
        'status',
      ),
    );
  }

  // A disputed call has to be argued, not just recorded. The note is the
  // artefact that makes the decision reusable later.
  if (status === 'disputed' && !reviewNote?.trim()) {
    return err(
      domainError('invalid_input', 'a dispute needs a written reason', 'reviewNote'),
    );
  }

  return ok({
    ...suggestion,
    status,
    reviewNote: reviewNote?.trim() ? reviewNote.trim().slice(0, 1000) : suggestion.reviewNote,
    reviewedAt: new Date(),
  });
}

/**
 * The shape exported for model training: prompt, chosen, rejected — the layout
 * preference-tuning pipelines expect, with the reason carried as metadata.
 */
export interface PreferencePair {
  readonly prompt: string;
  readonly chosen: string;
  readonly rejected: string;
  readonly tags: readonly ReasonTag[];
  readonly songId: string;
  readonly lineId: string;
}

export function toPreferencePair(suggestion: Suggestion): PreferencePair | null {
  if (suggestion.status !== 'accepted') return null;
  return {
    prompt: suggestion.originalLine,
    chosen: suggestion.proposedRendering,
    rejected: suggestion.engineDraft,
    tags: suggestion.tags,
    songId: suggestion.songId,
    lineId: suggestion.lineId,
  };
}
