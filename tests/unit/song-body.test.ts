import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_LINES,
  carryOverRenderings,
  lineKey,
  validateSongBody,
} from '@/domain/song/body';
import type { DraftSection } from '@/domain/song/body';
import { splitPairedPaste } from '@/domain/lyrics/paired-paste';
import type { Section } from '@/domain/song/song';
import { isErr, isOk } from '@/domain/shared/result';

/**
 * The rules that decide what may become a published body.
 *
 * The important ones are the refusals: a body with a blank rendering, or a
 * reason tag with no note behind it, would both render as something the page
 * cannot honestly show.
 */

function section(lines: DraftSection['lines'], label = 'Verse'): DraftSection {
  return { label, lines };
}

const LINE = { original: 'Sen gülünce güller açar', rendering: 'When you laugh, roses bloom' };

describe('validateSongBody', () => {
  it('accepts a body and numbers it from zero', () => {
    const result = validateSongBody([
      section([LINE, { original: 'Bizi bırakıp gittin', rendering: 'You left us' }]),
      section([{ original: 'Gülpembe', rendering: 'Gülpembe' }], 'Chorus'),
    ]);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.lineCount).toBe(3);
    expect(result.value.sections.map((s) => s.position)).toEqual([0, 1]);
    expect(result.value.sections[0]?.lines.map((l) => l.position)).toEqual([0, 1]);
  });

  it('renumbers rather than trusting the caller', () => {
    // A client that reordered its own array must not be able to reorder the song
    // by sending stale indices — positions are assigned here.
    const result = validateSongBody([section([LINE]), section([LINE], 'Second')]);
    if (!isOk(result)) throw new Error('expected ok');

    expect(result.value.sections[1]?.position).toBe(1);
  });

  it('refuses a line with no rendering', () => {
    const result = validateSongBody([
      section([LINE, { original: 'Bizi bırakıp gittin', rendering: '   ' }]),
    ]);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.field).toContain('rendering');
    }
  });

  it('refuses a reason tag with no note behind it', () => {
    const result = validateSongBody([
      section([{ ...LINE, tags: ['prosody'], note: '  ' }]),
    ]);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('missing_reason_tag');
  });

  it('refuses a tag it does not know', () => {
    const result = validateSongBody([
      section([{ ...LINE, tags: ['vibes'], note: 'because' }]),
    ]);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.field).toContain('tags');
  });

  it('drops blank rows and the sections left empty by them', () => {
    const result = validateSongBody([
      section([LINE]),
      section([{ original: '  ', rendering: '' }], 'Empty'),
    ]);

    if (!isOk(result)) throw new Error('expected ok');
    expect(result.value.sections).toHaveLength(1);
    expect(result.value.lineCount).toBe(1);
  });

  it('refuses a body with nothing in it', () => {
    expect(isErr(validateSongBody([]))).toBe(true);
    expect(isErr(validateSongBody([section([{ original: '', rendering: '' }])]))).toBe(true);
  });

  it('refuses a body past the line ceiling', () => {
    const many = Array.from({ length: MAX_BODY_LINES + 1 }, () => LINE);
    expect(isErr(validateSongBody([section(many)]))).toBe(true);
  });

  it('keeps a note but drops an empty one', () => {
    const result = validateSongBody([
      section([
        { ...LINE, note: '  the root-play is lost  ' },
        { original: 'a', rendering: 'b', note: '   ' },
      ]),
    ]);

    if (!isOk(result)) throw new Error('expected ok');
    expect(result.value.sections[0]?.lines[0]?.note).toBe('the root-play is lost');
    expect(result.value.sections[0]?.lines[1]?.note).toBeNull();
  });
});

describe('lineKey', () => {
  it('ignores case, punctuation and repeated spaces', () => {
    expect(lineKey('Sen gülünce, güller açar!')).toBe(lineKey('sen   gülünce güller açar'));
  });

  it('keeps different lines apart', () => {
    expect(lineKey('Where have you gone')).not.toBe(lineKey('Where have you been'));
  });
});

describe('carryOverRenderings', () => {
  const existing: Section[] = [
    {
      id: 's1',
      position: 0,
      label: 'Core',
      lines: [
        {
          id: 'l1',
          position: 0,
          original: 'Sen gülünce güller açar Gülpembe',
          rendering: 'When you laugh, roses bloom, Gülpembe',
          note: 'gül- is both laugh and rose',
          tags: ['form-embedded'],
        },
      ],
    },
  ];

  it('recovers the rendering, note and tags of a line it recognises', () => {
    const { sections, carried } = carryOverRenderings(
      [section([{ original: 'Sen gülünce güller açar, Gülpembe!', rendering: '' }])],
      existing,
    );

    expect(carried).toBe(1);
    expect(sections[0]?.lines[0]?.rendering).toBe('When you laugh, roses bloom, Gülpembe');
    expect(sections[0]?.lines[0]?.tags).toEqual(['form-embedded']);
  });

  it('never overwrites what the maintainer already typed', () => {
    const { sections, carried } = carryOverRenderings(
      [
        section([
          {
            original: 'Sen gülünce güller açar Gülpembe',
            rendering: 'A better line I just wrote',
          },
        ]),
      ],
      existing,
    );

    expect(carried).toBe(0);
    expect(sections[0]?.lines[0]?.rendering).toBe('A better line I just wrote');
  });

  it('leaves a line it does not recognise alone', () => {
    const { sections, carried } = carryOverRenderings(
      [section([{ original: 'Something else entirely', rendering: '' }])],
      existing,
    );

    expect(carried).toBe(0);
    expect(sections[0]?.lines[0]?.rendering).toBe('');
  });
});

describe('splitPairedPaste', () => {
  it('keeps the lyric intact and lifts the renderings out', () => {
    const result = splitPairedPaste(
      ['[Verse]', 'Te voglio bene assai | Seni öyle seviyorum ki', 'Qui dove il mare luccica'].join(
        '\n',
      ),
    );

    expect(result.lyrics).toBe(
      ['[Verse]', 'Te voglio bene assai', 'Qui dove il mare luccica'].join('\n'),
    );
    expect(result.renderings.get(lineKey('Te voglio bene assai'))).toBe(
      'Seni öyle seviyorum ki',
    );
    expect(result.renderings.size).toBe(1);
  });

  it('leaves a plain paste completely unchanged', () => {
    const plain = '[Chorus]\nfirst line\nsecond line';
    const result = splitPairedPaste(plain);

    expect(result.lyrics).toBe(plain);
    expect(result.renderings.size).toBe(0);
  });

  it('takes the first rendering when a repeated line is given two', () => {
    const result = splitPairedPaste('hook | first try\nhook | second try');
    expect(result.renderings.get(lineKey('hook'))).toBe('first try');
  });

  it('keeps the lyric in place when the rendering half is empty', () => {
    const result = splitPairedPaste('a line |\nanother line');
    expect(result.lyrics).toBe('a line\nanother line');
    expect(result.renderings.size).toBe(0);
  });

  it('lifts the note and the reason tags out of the later fields', () => {
    const result = splitPairedPaste(
      'a line | the rendering | why it reads this way | register, feel',
    );

    const key = lineKey('a line');
    expect(result.lyrics).toBe('a line');
    expect(result.renderings.get(key)).toBe('the rendering');
    expect(result.notes.get(key)).toBe('why it reads this way');
    expect(result.tags.get(key)).toEqual(['register', 'feel']);
  });

  it('treats every field after the lyric as optional', () => {
    const result = splitPairedPaste(
      ['first | rendering only', 'second | rendering | a note'].join('\n'),
    );

    expect(result.notes.has(lineKey('first'))).toBe(false);
    expect(result.tags.has(lineKey('first'))).toBe(false);
    expect(result.notes.get(lineKey('second'))).toBe('a note');
    expect(result.tags.has(lineKey('second'))).toBe(false);
  });

  it('drops a misspelled tag without costing the line its other work', () => {
    const result = splitPairedPaste('a line | rendering | note | regsiter, feel');

    const key = lineKey('a line');
    expect(result.tags.get(key)).toEqual(['feel']);
    expect(result.renderings.get(key)).toBe('rendering');
    expect(result.notes.get(key)).toBe('note');
  });

  it('accepts a note that itself has no tags after it', () => {
    const result = splitPairedPaste('a line | rendering | note |');
    expect(result.notes.get(lineKey('a line'))).toBe('note');
    expect(result.tags.size).toBe(0);
  });
});
