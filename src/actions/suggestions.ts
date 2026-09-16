'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getContainer } from '@/infrastructure/container';
import { requireAdmin } from '@/infrastructure/auth/admin-session';
import {
  reviewSuggestionUseCase,
  submitSuggestion,
} from '@/application/use-cases/suggestions';
import type { DomainErrorCode } from '@/domain/shared/result';
import type { SuggestionStatus } from '@/domain/suggestion/suggestion';
import { submitterKey } from '@/lib/submitter-key';

/**
 * Server actions for suggestions.
 *
 * Actions return a discriminated result rather than throwing, and the failure
 * carries a stable `code` — never a message. The client maps the code to a
 * translated sentence, which is what keeps error text out of the server and
 * inside the message catalogues where all three languages can see it.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: DomainErrorCode; field?: string };

export interface SubmitSuggestionInput {
  songId: string;
  lineId: string;
  originalLine: string;
  engineDraft: string;
  proposedRendering: string;
  tags: string[];
  comment?: string | null;
  contributorAlias?: string | null;
}

export async function submitSuggestionAction(
  input: SubmitSuggestionInput,
): Promise<ActionResult<{ id: string }>> {
  const container = getContainer();
  const key = await submitterKey(await headers());

  const result = await submitSuggestion(container, {
    ...input,
    submitterKey: key,
  });

  if (!result.ok) {
    return { ok: false, code: result.error.code, field: result.error.field };
  }

  return { ok: true, data: { id: result.value.id } };
}

export async function reviewSuggestionAction(
  id: string,
  status: SuggestionStatus,
  reviewNote?: string | null,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, code: 'forbidden' };
  }

  const result = await reviewSuggestionUseCase(getContainer(), {
    id,
    status,
    reviewNote,
  });

  if (!result.ok) {
    return { ok: false, code: result.error.code, field: result.error.field };
  }

  // Accepting rewrites the line, so every cached rendering of any song page is
  // now potentially stale. The catalogue is small; revalidating the subtree is
  // cheaper to reason about than tracking which slug changed.
  revalidatePath('/[locale]/songs/[slug]', 'page');
  revalidatePath('/[locale]/admin', 'page');

  return { ok: true, data: undefined };
}
