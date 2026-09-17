import { lineKey } from '../song/body';
import { normaliseTags, type ReasonTag } from '../song/reason-tag';

/**
 * A paste that carries the whole of a line's work beside the lyric.
 *
 *     original | rendering | note | tag, tag
 *
 * Everything after the first field is optional, so `original | rendering` and a
 * bare lyric line both still parse. That single character is what lets a
 * finished song arrive in one paste instead of fifty typed boxes — which is the
 * difference between the editor being usable for a catalogue and being usable
 * for a demo.
 *
 * The note and tag fields were added because pairing only the rendering left
 * the slowest half of the job untouched: a translator working a song produces
 * the reasoning in the same pass as the wording, and made to re-enter it line by
 * line they simply stop writing notes — which are the thing the product is for.
 *
 * Only the lyric survives into {@link PairedPaste.lyrics}: section detection,
 * repeat collapsing and noise filtering all run on the words exactly as they
 * would on a plain paste.
 */

export const PAIR_SEPARATOR = '|';

export interface PairedPaste {
  /** The lyric alone, ready for the extractor. */
  readonly lyrics: string;
  /** Rendering by {@link lineKey} of its original. */
  readonly renderings: ReadonlyMap<string, string>;
  /** Note by {@link lineKey} of its original. */
  readonly notes: ReadonlyMap<string, string>;
  /** Reason tags by {@link lineKey} of its original. */
  readonly tags: ReadonlyMap<string, readonly ReasonTag[]>;
}

/**
 * Reads the tag field: codes separated by commas, spaces or the middle dot the
 * legacy catalogue used. Unknown codes are dropped rather than refused — a typo
 * in a tag should cost the tag, never the paste.
 */
function readTags(field: string): ReasonTag[] {
  return normaliseTags(
    field
      .split(/[,·\s]+/)
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0),
  );
}

export function splitPairedPaste(raw: string): PairedPaste {
  const renderings = new Map<string, string>();
  const notes = new Map<string, string>();
  const tags = new Map<string, readonly ReasonTag[]>();
  const originals: string[] = [];

  for (const rawLine of raw.split('\n')) {
    if (!rawLine.includes(PAIR_SEPARATOR)) {
      originals.push(rawLine);
      continue;
    }

    const [first = '', second = '', third = '', fourth = ''] =
      rawLine.split(PAIR_SEPARATOR);

    const original = first.trim();
    const rendering = second.trim();
    const note = third.trim();
    const tagList = readTags(fourth);

    // The lyric keeps its place in the text even when the rendering is missing,
    // so a half-filled paste still extracts into the right sections.
    originals.push(original);

    const key = lineKey(original);
    if (key.length === 0) continue;

    // First writing wins throughout: a chorus pasted twice with two different
    // renderings is a mistake to notice in the editor, not to resolve silently
    // on whichever copy happened to come last.
    if (rendering.length > 0 && !renderings.has(key)) {
      renderings.set(key, rendering);
    }
    if (note.length > 0 && !notes.has(key)) {
      notes.set(key, note);
    }
    if (tagList.length > 0 && !tags.has(key)) {
      tags.set(key, tagList);
    }
  }

  return { lyrics: originals.join('\n'), renderings, notes, tags };
}
