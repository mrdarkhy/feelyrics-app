import { lineKey } from '../song/body';

/**
 * A paste that carries the translation beside the lyric.
 *
 * `orijinal | oturtma` on one line. That single character is what lets a
 * finished song arrive in one paste instead of fifty typed boxes — which is the
 * difference between the editor being usable for a catalogue and being usable
 * for a demo.
 *
 * The right-hand side is stripped before the extractor ever sees the text, so
 * section detection, repeat collapsing and noise filtering all work on the lyric
 * exactly as they would on a plain paste.
 */

export const PAIR_SEPARATOR = '|';

export interface PairedPaste {
  /** The lyric alone, ready for the extractor. */
  readonly lyrics: string;
  /** Rendering by {@link lineKey} of its original. */
  readonly renderings: ReadonlyMap<string, string>;
}

export function splitPairedPaste(raw: string): PairedPaste {
  const renderings = new Map<string, string>();
  const originals: string[] = [];

  for (const rawLine of raw.split('\n')) {
    const at = rawLine.indexOf(PAIR_SEPARATOR);
    if (at === -1) {
      originals.push(rawLine);
      continue;
    }

    const original = rawLine.slice(0, at).trim();
    const rendering = rawLine.slice(at + PAIR_SEPARATOR.length).trim();

    // The lyric keeps its place in the text even when the rendering is missing,
    // so a half-filled paste still extracts into the right sections.
    originals.push(original);

    const key = lineKey(original);
    // First writing wins: a chorus pasted twice with two different renderings is
    // a mistake to notice in the editor, not to resolve silently on the last one.
    if (key.length > 0 && rendering.length > 0 && !renderings.has(key)) {
      renderings.set(key, rendering);
    }
  }

  return { lyrics: originals.join('\n'), renderings };
}
