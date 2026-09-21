import { describe, expect, it } from 'vitest';
import {
  assembleEngineDraft,
  buildEngineBrief,
  extractJsonObject,
} from '@/domain/song/engine-output';
import { extractLyrics } from '@/domain/lyrics/extract';
import { validateSongBody } from '@/domain/song/body';
import { isErr, isOk, unwrap } from '@/domain/shared/result';
import { withSyncData, fromSharePackage, toSharePackage } from '@/domain/song/share-package';
import type { Song } from '@/domain/song/song';

/**
 * The engine answers by index; the domain re-attaches the words. These tests
 * pin the two rules that matter: an original never comes from the model, and a
 * line the model skipped fails the whole draft rather than slipping through.
 */

const LYRICS = ['[Verse]', 'first line here', 'second line here', '', '[Chorus]', 'la la la'].join(
  '\n',
);

function brief() {
  const extraction = unwrap(extractLyrics(LYRICS));
  return buildEngineBrief(extraction, {
    title: 'Test',
    artist: 'Tester',
    source: 'en',
    target: 'tr',
    requesterNote: null,
  });
}

describe('buildEngineBrief', () => {
  it('numbers lines in reading order across sections', () => {
    const b = brief();
    expect(b.lineCount).toBe(3);
    expect(b.sections.map((s) => s.lines.map((l) => l.i))).toEqual([[0, 1], [2]]);
  });
});

describe('extractJsonObject', () => {
  it('finds the object inside fences and prose', () => {
    expect(extractJsonObject('Sure:\n```json\n{"feel":"x","sections":[]}\n```')).toEqual({
      feel: 'x',
      sections: [],
    });
    expect(extractJsonObject('no json here')).toBeNull();
  });
});

describe('assembleEngineDraft', () => {
  const answer = {
    feel: 'sakin bir veda',
    sections: [
      {
        label: 'Kıta',
        lines: [
          { i: 0, t: 'ilk satır burada', n: 'düz okuma yeter', g: ['literal-wins', 'bogus'] },
          { i: 1, t: 'ikinci satır burada' },
        ],
      },
      { label: 'Nakarat', lines: [{ i: 2, t: 'la la la', n: 'söylendiği gibi', g: ['onomatopoeia'] }] },
    ],
  };

  it('re-attaches originals, keeps notes, drops unknown tags', () => {
    const draft = unwrap(assembleEngineDraft(brief(), answer));
    expect(draft.feelProfile).toBe('sakin bir veda');
    expect(draft.sections[0]?.label).toBe('Kıta');
    expect(draft.sections[0]?.lines[0]).toEqual({
      original: 'first line here',
      rendering: 'ilk satır burada',
      note: 'düz okuma yeter',
      tags: ['literal-wins'],
    });
    expect(draft.unannotated).toBe(1);
    expect(isOk(validateSongBody(draft.sections))).toBe(true);
  });

  it('fails the draft when a line is missing', () => {
    const partial = { ...answer, sections: [answer.sections[0]] };
    const result = assembleEngineDraft(brief(), partial);
    expect(isErr(result) && result.error.code).toBe('engine_failed');
  });

  it('falls back to a target-language section label', () => {
    const unlabelled = {
      ...answer,
      sections: answer.sections.map((s) => ({ ...s, label: '' })),
    };
    const extraction = unwrap(extractLyrics('one\ntwo\n\nthree'));
    const b = buildEngineBrief(extraction, {
      title: 'T',
      artist: 'A',
      source: 'en',
      target: 'es',
      requesterNote: null,
    });
    const draft = unwrap(assembleEngineDraft(b, unlabelled));
    expect(draft.sections[0]?.label).toBe('Parte 1');
  });

  it('drops tags on a line without a note, so the body validator accepts it', () => {
    const tagged = {
      ...answer,
      sections: [
        { label: 'K', lines: [{ i: 0, t: 'a', g: ['feel'] }, { i: 1, t: 'b' }] },
        { label: 'N', lines: [{ i: 2, t: 'c' }] },
      ],
    };
    const draft = unwrap(assembleEngineDraft(brief(), tagged));
    expect(draft.sections[0]?.lines[0]?.tags).toEqual([]);
  });
});

describe('share package sync data', () => {
  const song: Song = {
    id: 'x',
    slug: 'x',
    title: 'T',
    artist: 'A',
    pair: { source: 'en', target: 'tr' },
    engineVersion: '0.2.0',
    feelProfile: null,
    provenance: 'user-paste',
    requestedBy: null,
    validatedBy: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    sections: [
      {
        id: 's',
        position: 0,
        label: 'K',
        lines: [
          { id: 'l1', position: 0, original: 'a', rendering: 'b', note: null, tags: [] },
          { id: 'l2', position: 1, original: 'c', rendering: 'd', note: null, tags: [] },
        ],
      },
    ],
  };

  it('round-trips a track id and timings through the package', () => {
    const pkg = withSyncData(toSharePackage(song), {
      spotifyTrackId: '4uLU6hMCjMI75M1A2tKUQC',
      timings: [1200.4, 5300],
    });
    const back = unwrap(fromSharePackage(JSON.parse(JSON.stringify(pkg))));
    expect(back.sync).toEqual({ spotifyTrackId: '4uLU6hMCjMI75M1A2tKUQC', timings: [1200, 5300] });
  });

  it('drops an invalid track id and reads packages without sync data', () => {
    const pkg = withSyncData(toSharePackage(song), { spotifyTrackId: 'nope', timings: null });
    expect('sp' in pkg).toBe(false);
    const back = unwrap(fromSharePackage(JSON.parse(JSON.stringify(toSharePackage(song)))));
    expect(back.sync).toEqual({ spotifyTrackId: null, timings: null });
  });
});
