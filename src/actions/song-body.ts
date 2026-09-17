'use server';

import { revalidatePath } from 'next/cache';
import { getContainer } from '@/infrastructure/container';
import { requireAdmin } from '@/infrastructure/auth/admin-session';
import {
  closeRequestForSong,
  createSongsFromRequest,
  extractForEditing,
  getPasteForSong,
  getSongForEditing,
  replaceSongBody,
} from '@/application/use-cases/song-body';
import { isLanguageCode } from '@/domain/shared/language';
import { carryOverRenderings, lineKey } from '@/domain/song/body';
import { splitPairedPaste } from '@/domain/lyrics/paired-paste';
import { UI_LOCALES } from '@/domain/shared/language';
import type { DraftSection } from '@/domain/song/body';
import type { ActionResult } from './suggestions';

/**
 * Server actions for the lyrics editor.
 *
 * Every one of them starts with `requireAdmin`. These are the only actions in
 * the app that read and write whole lyric bodies, so the guard is the first
 * statement rather than a condition somewhere in the middle — easy to audit by
 * looking at the top of each function.
 */

export interface EditorLine {
  original: string;
  rendering: string;
  note: string | null;
  tags: string[];
}

export interface EditorSection {
  label: string;
  lines: EditorLine[];
}

export interface EditorBody {
  slug: string;
  title: string;
  artist: string;
  source: string;
  target: string;
  provenance: string;
  sections: EditorSection[];
  /** The asker's paste, when this song came from a request still holding one. */
  pastedLyrics: string | null;
}

function toEditorSections(sections: readonly DraftSection[]): EditorSection[] {
  return sections.map((section) => ({
    label: section.label,
    lines: section.lines.map((line) => ({
      original: line.original,
      rendering: line.rendering,
      note: line.note ?? null,
      tags: [...(line.tags ?? [])],
    })),
  }));
}

/** The song as it stands, so the editor opens on the real thing. */
export async function loadSongBodyAction(slug: string): Promise<ActionResult<EditorBody>> {
  await requireAdmin();

  const result = await getSongForEditing(getContainer(), slug);
  if (!result.ok) return { ok: false, code: result.error.code, field: result.error.field };

  const song = result.value;
  const pastedLyrics = await getPasteForSong(getContainer(), slug);

  return {
    ok: true,
    data: {
      pastedLyrics,
      slug: song.slug,
      title: song.title,
      artist: song.artist,
      source: song.pair.source,
      target: song.pair.target,
      provenance: song.provenance,
      sections: song.sections.map((section) => ({
        label: section.label,
        lines: section.lines.map((line) => ({
          original: line.original,
          rendering: line.rendering,
          note: line.note,
          tags: [...line.tags],
        })),
      })),
    },
  };
}

export interface ExtractedBodyResult {
  sections: EditorSection[];
  /** Lines whose earlier rendering, note and tags were recovered. */
  carried: number;
  /** Lines whose rendering arrived in the paste itself, after a `|`. */
  paired: number;
  /** Lines whose note or reason tags arrived in the paste too. */
  annotated: number;
  /** Lines the extractor threw out as lyric-site furniture. */
  discarded: string[];
  /** True when blank lines, not markers, did the grouping. */
  inferredStructure: boolean;
}

/**
 * Turns a paste into an editable body, carrying the song's existing work onto
 * the lines it recognises.
 */
export async function extractBodyAction(
  slug: string,
  lyrics: string,
): Promise<ActionResult<ExtractedBodyResult>> {
  await requireAdmin();

  const paste = splitPairedPaste(lyrics);

  const extracted = extractForEditing(paste.lyrics);
  if (!extracted.ok) {
    return { ok: false, code: extracted.error.code, field: extracted.error.field };
  }

  const song = await getSongForEditing(getContainer(), slug);
  if (!song.ok) return { ok: false, code: song.error.code, field: song.error.field };

  let paired = 0;
  let annotated = 0;

  const draft: DraftSection[] = extracted.value.sections.map((section, index) => ({
    label: section.label ?? `${index + 1}`,
    lines: section.lines.map((line) => {
      const key = lineKey(line.text);
      const rendering = paste.renderings.get(key) ?? '';
      const note = paste.notes.get(key) ?? null;
      const tags = paste.tags.get(key) ?? [];

      if (rendering.length > 0) paired += 1;
      if (note !== null || tags.length > 0) annotated += 1;

      return { original: line.text, rendering, note, tags: [...tags] };
    }),
  }));

  // Whatever the paste did not carry, the song may already know.
  const { sections, carried } = carryOverRenderings(draft, song.value.sections);

  return {
    ok: true,
    data: {
      sections: toEditorSections(sections),
      carried,
      paired,
      annotated,
      discarded: [...extracted.value.discardedLines],
      inferredStructure: extracted.value.inferredStructure,
    },
  };
}

export interface SaveBodyResult {
  lineCount: number;
  previousLineCount: number;
  /** True when this save also marked a waiting request as ready. */
  closedRequest: boolean;
}

export async function saveSongBodyAction(
  slug: string,
  sections: EditorSection[],
): Promise<ActionResult<SaveBodyResult>> {
  await requireAdmin();

  const container = getContainer();
  const result = await replaceSongBody(container, { slug, sections });
  if (!result.ok) return { ok: false, code: result.error.code, field: result.error.field };

  // A song that came from a request is finished the moment it has a body, and
  // closing the request is what clears the words the asker pasted.
  const closedRequest = await closeRequestForSong(container, slug);

  // Concrete URLs rather than the route pattern: the library sits inside a
  // route group, so the pattern form would have to spell the group out to match,
  // and a near-miss there fails silently — the save lands and the page keeps
  // serving the old body until the ISR window closes.
  for (const locale of UI_LOCALES) {
    revalidatePath(`/${locale}/songs/${slug}`);
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/requests`);
  }
  revalidatePath('/sitemap.xml');

  return {
    ok: true,
    data: {
      lineCount: result.value.lineCount,
      previousLineCount: result.value.previousLineCount,
      closedRequest,
    },
  };
}

export interface CreatedSongs {
  created: string[];
  existing: string[];
}

/**
 * Opens the song rows a request asked for — one per target language.
 *
 * The source language is chosen here rather than guessed: the asker names what
 * they want it translated into, never what it is already in, and guessing from
 * the title would be wrong often enough to matter.
 */
export async function createSongsFromRequestAction(
  requestId: string,
  source: string,
): Promise<ActionResult<CreatedSongs>> {
  await requireAdmin();

  if (!isLanguageCode(source)) {
    return { ok: false, code: 'unsupported_language', field: 'source' };
  }

  const result = await createSongsFromRequest(getContainer(), { requestId, source });
  if (!result.ok) return { ok: false, code: result.error.code, field: result.error.field };

  for (const locale of UI_LOCALES) revalidatePath(`/${locale}`);
  revalidatePath('/[locale]/admin', 'page');

  return {
    ok: true,
    data: { created: [...result.value.created], existing: [...result.value.existing] },
  };
}
