import { allowsFullPublication, countLines } from './song';
import type { Line, PublicSong, Section, Song } from './song';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MINIMAL QUOTE POLICY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Song lyrics are copyrighted, and a translation of them is a derivative work.
 * Feelyrics works with lyrics that people paste in themselves, which is a
 * defensible position for a private reading — and stops being one the moment the
 * same text is served from our own pages to anyone who asks.
 *
 * So the product draws a hard line:
 *
 *   • Anything a public page can reach shows at most TWO lines of any one song,
 *     each paired with the reasoning that makes it commentary rather than
 *     republication.
 *   • The full body of a song never travels through our server. It lives in the
 *     fragment of a share link (`/s#f1.…`), which browsers do not transmit, so
 *     it goes from the sender's device straight to the reader's.
 *   • Songs whose lyrics are out of copyright, or covered by a licence we hold,
 *     are exempt — and must say which, in `provenance`.
 *
 * This module is where that rule lives. It is not a UI convention and not a
 * reviewer's habit: `PublicSong` is a branded type that only `toPublicSong` can
 * produce, so every public surface is structurally forced through the cap. If
 * someone later writes a page that renders a raw `Song`, it will not compile.
 *
 * The limit is deliberately stricter than what licensed platforms allow
 * themselves (Apple Music shares roughly five lines, Spotify a consecutive
 * passage) because we are the ones without the licence.
 */

/** Lines of any single song that may appear on a public surface. */
export const MAX_PUBLIC_LINES_PER_SONG = 2;

/**
 * Cards carry one line and one rendering, and no more than this many cards may
 * be produced from the same song — otherwise a series of cards reassembles the
 * lyric that the per-page cap was protecting.
 */
export const MAX_CARDS_PER_SONG = 2;

/** Characters of a single line that may be quoted, before an ellipsis. */
export const MAX_QUOTED_LINE_LENGTH = 220;

export interface PublicProjectionOptions {
  /**
   * Override the cap downwards — never upwards. Search-result snippets pass 1.
   */
  readonly maxLines?: number;
}

function truncateLine(line: Line): Line {
  if (line.original.length <= MAX_QUOTED_LINE_LENGTH) return line;
  return {
    ...line,
    original: `${line.original.slice(0, MAX_QUOTED_LINE_LENGTH).trimEnd()}…`,
  };
}

/**
 * Walks sections in order and keeps lines until the budget runs out, preferring
 * lines that carry a note.
 *
 * The preference matters legally as much as editorially: an annotated line is
 * commentary on the work, an unannotated one is just a piece of the work. If a
 * song has exactly two annotated lines buried in verse three, those are the two
 * that should surface.
 */
function selectQuotableLines(
  sections: readonly Section[],
  budget: number,
): Section[] {
  const annotated: Array<{ sectionIndex: number; line: Line }> = [];
  const plain: Array<{ sectionIndex: number; line: Line }> = [];

  sections.forEach((section, sectionIndex) => {
    for (const line of section.lines) {
      const bucket = line.note && line.note.trim().length > 0 ? annotated : plain;
      bucket.push({ sectionIndex, line });
    }
  });

  const chosen = [...annotated, ...plain].slice(0, budget);
  if (chosen.length === 0) return [];

  // Rebuild the section structure around the chosen lines so the reader still
  // sees which part of the song a line came from.
  const bySection = new Map<number, Line[]>();
  for (const { sectionIndex, line } of chosen) {
    const existing = bySection.get(sectionIndex);
    if (existing) existing.push(truncateLine(line));
    else bySection.set(sectionIndex, [truncateLine(line)]);
  }

  return [...bySection.entries()]
    .sort(([a], [b]) => a - b)
    .map(([sectionIndex, lines], position) => {
      const source = sections[sectionIndex];
      return {
        id: source?.id ?? `section-${sectionIndex}`,
        position,
        label: source?.label ?? '',
        lines: lines.sort((a, b) => a.position - b.position),
      };
    });
}

/**
 * The single door to any public surface.
 *
 * Every read path that ends up on a page a stranger can open — the library, a
 * song page, the sitemap, an OG image, a feel card — goes through here.
 */
export function toPublicSong(
  song: Song,
  options: PublicProjectionOptions = {},
): PublicSong {
  const totalLineCount = countLines(song);

  if (allowsFullPublication(song.provenance)) {
    return {
      ...song,
      __brand: 'PublicSong',
      truncated: false,
      totalLineCount,
    };
  }

  const budget = Math.max(
    0,
    Math.min(options.maxLines ?? MAX_PUBLIC_LINES_PER_SONG, MAX_PUBLIC_LINES_PER_SONG),
  );

  const sections = selectQuotableLines(song.sections, budget);
  const shownLineCount = sections.reduce((n, s) => n + s.lines.length, 0);

  return {
    ...song,
    sections,
    __brand: 'PublicSong',
    truncated: shownLineCount < totalLineCount,
    totalLineCount,
  };
}

/**
 * Guard for the places where a cap cannot be expressed in the type system —
 * a hand-built payload, a legacy import, a test fixture.
 */
export function violatesQuoteLimit(song: Pick<Song, 'provenance' | 'sections'>): boolean {
  if (allowsFullPublication(song.provenance)) return false;
  return countLines(song) > MAX_PUBLIC_LINES_PER_SONG;
}

/**
 * Whether the full body of this song may be handed to a browser at all — which
 * is true even for user-pasted lyrics, because share links carry the payload in
 * the URL fragment and never reach a server. The distinction this guards is not
 * "who may read it" but "what may be served from our origin".
 */
export function mayTravelInShareLink(song: Pick<Song, 'provenance'>): boolean {
  return (
    song.provenance === 'user-paste' ||
    song.provenance === 'public-domain' ||
    song.provenance === 'licensed'
  );
}
