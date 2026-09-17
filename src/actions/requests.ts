'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getContainer } from '@/infrastructure/container';
import { requireAdmin } from '@/infrastructure/auth/admin-session';
import { submitRequest, updateRequestStatus } from '@/application/use-cases/requests';
import { extractLyricsUseCase } from '@/application/use-cases/extract-lyrics';
import type { RequestStatus } from '@/domain/request/song-request';
import { submitterKey } from '@/lib/submitter-key';
import type { ActionResult } from './suggestions';

export interface SubmitRequestInput {
  title: string;
  artist: string;
  targets: string[];
  requesterAlias?: string | null;
  /** One line on why this song — shown on the queue beside the request. */
  requesterNote?: string | null;
  /**
   * Pasted lyrics.
   *
   * They are used to confirm the request arrives with words and to give the
   * song a shape — and are then discarded. Nothing about them is written to the
   * database, which is what lets the form ask for them at all.
   */
  lyrics?: string | null;
}

export async function submitRequestAction(
  input: SubmitRequestInput,
): Promise<ActionResult<{ id: string; duplicate: boolean; lineCount: number }>> {
  const container = getContainer();
  const key = await submitterKey(await headers());

  let lineCount = 0;
  const pasted = input.lyrics?.trim() ?? '';

  if (pasted.length > 0) {
    const extraction = await extractLyricsUseCase(container, {
      lyrics: pasted,
      submitterKey: key,
    });

    if (!extraction.ok) {
      return { ok: false, code: extraction.error.code, field: 'lyrics' };
    }
    lineCount = extraction.value.lineCount;
  }

  const before = await container.requests.findRecentDuplicate(
    input.title.trim(),
    input.artist.trim(),
    30 * 24 * 60 * 60 * 1000,
  );

  const result = await submitRequest(container, {
    title: input.title,
    artist: input.artist,
    targets: input.targets,
    requesterAlias: input.requesterAlias,
    requesterNote: input.requesterNote,
    hasLyrics: lineCount > 0,
    lyricLineCount: lineCount > 0 ? lineCount : null,
    pastedLyrics: pasted.length > 0 ? pasted : null,
    submitterKey: key,
  });

  if (!result.ok) {
    return { ok: false, code: result.error.code, field: result.error.field };
  }

  revalidatePath('/[locale]/requests', 'page');

  return {
    ok: true,
    data: {
      id: result.value.id,
      duplicate: before !== null && before.id === result.value.id,
      lineCount,
    },
  };
}

export async function updateRequestStatusAction(
  id: string,
  status: RequestStatus,
  songSlug?: string | null,
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, code: 'forbidden' };
  }

  const result = await updateRequestStatus(getContainer(), { id, status, songSlug });

  if (!result.ok) {
    return { ok: false, code: result.error.code, field: result.error.field };
  }

  revalidatePath('/[locale]/requests', 'page');
  revalidatePath('/[locale]/admin', 'page');

  return { ok: true, data: undefined };
}
