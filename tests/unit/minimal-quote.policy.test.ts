import { describe, expect, it } from 'vitest';
import {
  MAX_PUBLIC_LINES_PER_SONG,
  mayTravelInShareLink,
  toPublicSong,
  violatesQuoteLimit,
} from '@/domain/song/minimal-quote.policy';
import type { LyricsProvenance, Section, Song } from '@/domain/song/song';

/**
 * These are the load-bearing tests of the whole project.
 *
 * The minimal-quote policy is what makes publishing lyrics defensible at all. If
 * it quietly stops capping — a refactor, a new page, a helpful "simplification"
 * — nothing visibly breaks, the site just starts republishing copyrighted work.
 * So the rule gets tested from every direction, including the ones that look
 * paranoid.
 */

function makeSong(
  lineCount: number,
  provenance: LyricsProvenance = 'user-paste',
  options: { annotateFrom?: number } = {},
): Song {
  const annotateFrom = options.annotateFrom ?? 0;

  const sections: Section[] = [
    {
      id: 'section-1',
      position: 0,
      label: 'Verse',
      lines: Array.from({ length: lineCount }, (_, index) => ({
        id: `line-${index}`,
        position: index,
        original: `original ${index}`,
        rendering: `rendering ${index}`,
        note: index >= annotateFrom ? `note ${index}` : null,
        tags: [],
      })),
    },
  ];

  return {
    id: 'song-1',
    slug: 'artist-title-es-tr',
    title: 'Title',
    artist: 'Artist',
    pair: { source: 'es', target: 'tr' },
    engineVersion: '0.1.1',
    feelProfile: null,
    provenance,
    sections,
    requestedBy: null,
    validatedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

function countLines(song: { sections: readonly Section[] }): number {
  return song.sections.reduce((total, section) => total + section.lines.length, 0);
}

describe('minimal quote policy', () => {
  it('caps a user-pasted song at two lines', () => {
    const projected = toPublicSong(makeSong(40));
    expect(countLines(projected)).toBe(MAX_PUBLIC_LINES_PER_SONG);
    expect(projected.truncated).toBe(true);
    expect(projected.totalLineCount).toBe(40);
  });

  it('leaves a song that is already short alone', () => {
    const projected = toPublicSong(makeSong(2));
    expect(countLines(projected)).toBe(2);
    expect(projected.truncated).toBe(false);
  });

  it('publishes public-domain lyrics in full', () => {
    const projected = toPublicSong(makeSong(40, 'public-domain'));
    expect(countLines(projected)).toBe(40);
    expect(projected.truncated).toBe(false);
  });

  it('publishes licensed lyrics in full', () => {
    const projected = toPublicSong(makeSong(40, 'licensed'));
    expect(countLines(projected)).toBe(40);
  });

  it('never lets a caller raise the cap', () => {
    // The option exists so a search snippet can ask for fewer lines. Asking for
    // more must be silently clamped rather than honoured.
    const projected = toPublicSong(makeSong(40), { maxLines: 99 });
    expect(countLines(projected)).toBe(MAX_PUBLIC_LINES_PER_SONG);
  });

  it('honours a lower cap', () => {
    const projected = toPublicSong(makeSong(40), { maxLines: 1 });
    expect(countLines(projected)).toBe(1);
  });

  it('treats a negative cap as zero rather than as unlimited', () => {
    const projected = toPublicSong(makeSong(40), { maxLines: -5 });
    expect(countLines(projected)).toBe(0);
  });

  it('prefers annotated lines, because commentary is the defensible use', () => {
    // Only lines 10 and 11 carry notes; those are the two that should surface.
    const song = makeSong(12, 'user-paste', { annotateFrom: 10 });
    const projected = toPublicSong(song);
    const chosen = projected.sections.flatMap((section) => section.lines);

    expect(chosen).toHaveLength(2);
    expect(chosen.every((line) => line.note !== null)).toBe(true);
  });

  it('truncates an absurdly long single line', () => {
    const song = makeSong(1);
    const longLine = {
      ...song,
      sections: [
        {
          ...song.sections[0]!,
          lines: [{ ...song.sections[0]!.lines[0]!, original: 'x'.repeat(5_000) }],
        },
      ],
    };

    const projected = toPublicSong(longLine);
    const line = projected.sections[0]?.lines[0];
    expect(line?.original.length).toBeLessThanOrEqual(221);
    expect(line?.original.endsWith('…')).toBe(true);
  });

  it('caps a song whose lines are spread across many sections', () => {
    const song = makeSong(0);
    const spread: Song = {
      ...song,
      sections: Array.from({ length: 8 }, (_, sectionIndex) => ({
        id: `s-${sectionIndex}`,
        position: sectionIndex,
        label: `Section ${sectionIndex}`,
        lines: Array.from({ length: 5 }, (_, lineIndex) => ({
          id: `s${sectionIndex}-l${lineIndex}`,
          position: lineIndex,
          original: `o ${sectionIndex}.${lineIndex}`,
          rendering: `r ${sectionIndex}.${lineIndex}`,
          note: null,
          tags: [],
        })),
      })),
    };

    expect(countLines(toPublicSong(spread))).toBe(MAX_PUBLIC_LINES_PER_SONG);
  });

  it('flags a raw song that exceeds the limit', () => {
    expect(violatesQuoteLimit(makeSong(3))).toBe(true);
    expect(violatesQuoteLimit(makeSong(2))).toBe(false);
    expect(violatesQuoteLimit(makeSong(300, 'public-domain'))).toBe(false);
  });

  it('allows any provenance to travel inside a share link', () => {
    // Share links never touch the server, so the limit that applies to pages we
    // host does not apply to them. This is the one place the rule is different,
    // and it is different for a stated reason rather than by oversight.
    expect(mayTravelInShareLink({ provenance: 'user-paste' })).toBe(true);
    expect(mayTravelInShareLink({ provenance: 'public-domain' })).toBe(true);
    expect(mayTravelInShareLink({ provenance: 'licensed' })).toBe(true);
  });

  it('keeps section structure so a quoted line stays in context', () => {
    const song = makeSong(0);
    const twoSections: Song = {
      ...song,
      sections: [
        {
          id: 'a',
          position: 0,
          label: 'Verse',
          lines: [
            {
              id: 'a1',
              position: 0,
              original: 'first',
              rendering: 'ilk',
              note: 'why',
              tags: [],
            },
          ],
        },
        {
          id: 'b',
          position: 1,
          label: 'Chorus',
          lines: [
            {
              id: 'b1',
              position: 0,
              original: 'second',
              rendering: 'ikinci',
              note: 'why too',
              tags: [],
            },
          ],
        },
      ],
    };

    const projected = toPublicSong(twoSections);
    expect(projected.sections).toHaveLength(2);
    expect(projected.sections[0]?.label).toBe('Verse');
    expect(projected.sections[1]?.label).toBe('Chorus');
  });
});
