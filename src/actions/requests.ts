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
  /** The interface language the note was typed in. */
  requesterNoteLanguage?: string | null;
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
    requesterNoteLanguage: input.requesterNoteLanguage,
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

  const container = getContainer();

  /**
   * Marking a request ready is what discards the lyrics it arrived with — the
   * promise the form makes to whoever pasted them. That is only an honest trade
   * once the song those words were meant for actually has a body: otherwise the
   * button destroys the one copy of the lyrics and leaves an empty song behind.
   *
   * So the check is here, before the transition, and not only in the button's
   * `disabled` attribute. A disabled button is a courtesy to the person using
   * the page; this is the rule.
   */
  if (status === 'ready') {
    const slug = songSlug?.trim() ?? '';
    if (slug.length === 0) {
      return { ok: false, code: 'invalid_input', field: 'songSlug' };
    }

    const song = await container.songs.findFullBySlug(slug);
    if (!song) {
      return { ok: false, code: 'not_found', field: 'songSlug' };
    }

    const lineCount = song.sections.reduce(
      (total, section) => total + section.lines.length,
      0,
    );
    if (lineCount === 0) {
      return { ok: false, code: 'song_not_translated', field: 'songSlug' };
    }
  }

  const result = await updateRequestStatus(container, { id, status, songSlug });

  if (!result.ok) {
    return { ok: false, code: result.error.code, field: result.error.field };
  }

  revalidatePath('/[locale]/requests', 'page');
  revalidatePath('/[locale]/admin', 'page');

  return { ok: true, data: undefined };
}
