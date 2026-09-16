import { describe, expect, it } from 'vitest';
import { extractLyrics, MAX_LYRICS_LENGTH } from '@/domain/lyrics/extract';
import { isErr, isOk, unwrap } from '@/domain/shared/result';

describe('lyric extraction', () => {
  it('splits on bracketed section markers', () => {
    const result = extractLyrics(
      '[Verse 1]\nfirst line\nsecond line\n\n[Chorus]\nhook line',
    );

    expect(isOk(result)).toBe(true);
    const value = unwrap(result);
    expect(value.sections).toHaveLength(2);
    expect(value.sections[0]?.label).toBe('Verse 1');
    expect(value.sections[0]?.lines).toHaveLength(2);
    expect(value.sections[1]?.label).toBe('Chorus');
    expect(value.inferredStructure).toBe(false);
  });

  it('recognises markers in the languages the catalogue actually contains', () => {
    for (const marker of ['[Nakarat]', '[Estribillo]', '[Ritornello]', '[Refrão]']) {
      const value = unwrap(extractLyrics(`${marker}\nbir satır`));
      expect(value.sections[0]?.label).toBe(marker.slice(1, -1));
    }
  });

  it('accepts colon and parenthesis marker styles', () => {
    expect(unwrap(extractLyrics('Chorus:\nline')).sections[0]?.label).toBe('Chorus');
    expect(unwrap(extractLyrics('(Verse 2)\nline')).sections[0]?.label).toBe('Verse 2');
  });

  it('falls back to blank lines when nothing is marked', () => {
    const value = unwrap(extractLyrics('one\ntwo\n\nthree\nfour'));
    expect(value.sections).toHaveLength(2);
    expect(value.inferredStructure).toBe(true);
  });

  it('collapses a repeated chorus into one section that repeats', () => {
    const value = unwrap(
      extractLyrics(
        '[Chorus]\nsame line\nsame other\n\n[Verse]\ndifferent\n\n[Chorus]\nsame line\nsame other',
      ),
    );

    expect(value.sections).toHaveLength(2);
    const chorus = value.sections.find((section) => section.label === 'Chorus');
    expect(chorus?.repeats).toBe(2);
  });

  it('treats punctuation-only differences as the same block', () => {
    // "Same line!" and "same line" are the same chorus typed twice, not two.
    const value = unwrap(extractLyrics('Same line!\n\nsame line'));
    expect(value.sections).toHaveLength(1);
    expect(value.sections[0]?.repeats).toBe(2);
  });

  it('strips lyric-site furniture and reports what it dropped', () => {
    const value = unwrap(
      extractLyrics(
        '12 Contributors\nTranslations\nreal line\nYou might also like\nanother real line\n42Embed',
      ),
    );

    const allLines = value.sections.flatMap((section) => section.lines);
    expect(allLines.map((line) => line.text)).toEqual(['real line', 'another real line']);
    expect(value.discardedLines.length).toBe(4);
  });

  it('keeps a lyric that merely contains a noise word', () => {
    // Only whole lines are furniture. "Embed me in your heart" is a lyric.
    const value = unwrap(extractLyrics('Embed me in your heart'));
    expect(value.sections[0]?.lines[0]?.text).toBe('Embed me in your heart');
  });

  it('marks fully parenthesised lines as ad-libs', () => {
    const value = unwrap(extractLyrics('lead line\n(backing vocal)'));
    const lines = value.sections.flatMap((section) => section.lines);
    expect(lines[0]?.isAdLib).toBe(false);
    expect(lines[1]?.isAdLib).toBe(true);
  });

  it('normalises smart quotes and non-breaking spaces from web copy-paste', () => {
    const value = unwrap(extractLyrics('it’s fine'));
    expect(value.sections[0]?.lines[0]?.text).toBe("it's fine");
  });

  it('rejects an empty paste', () => {
    const result = extractLyrics('   \n\n  ');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('empty_lyrics');
  });

  it('rejects a paste that is only furniture', () => {
    const result = extractLyrics('Embed\nYou might also like');
    expect(isErr(result)).toBe(true);
  });

  it('rejects input past the size ceiling', () => {
    const result = extractLyrics('a\n'.repeat(MAX_LYRICS_LENGTH));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('invalid_input');
  });

  it('rejects a non-string without throwing', () => {
    // The edge endpoint hands over whatever was in the request body.
    const result = extractLyrics(42 as unknown as string);
    expect(isErr(result)).toBe(true);
  });
});
