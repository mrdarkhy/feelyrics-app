import { describe, expect, it } from 'vitest';
import {
  MAX_REQUIRED_NOTES,
  MIN_REQUIRED_NOTES,
  gradeDraft,
  isRestatedNote,
  requiredNotes,
} from '@/domain/song/draft-quality';
import type { DraftFacts } from '@/domain/song/draft-quality';

const facts = (over: Partial<DraftFacts> = {}): DraftFacts => ({
  lineCount: 20,
  translatableLines: 20,
  echoedLines: 0,
  notedLines: 3,
  taggedLines: 3,
  hasFeelProfile: true,
  ...over,
});

describe('requiredNotes', () => {
  it('never asks a short fragment for more notes than it has lines', () => {
    expect(requiredNotes(2)).toBe(2);
    expect(requiredNotes(1)).toBe(1);
    expect(requiredNotes(0)).toBe(0);
  });

  it('holds the floor for ordinary songs', () => {
    expect(requiredNotes(12)).toBe(MIN_REQUIRED_NOTES);
  });

  it('scales with length instead of staying flat', () => {
    expect(requiredNotes(40)).toBe(6);
  });

  it('stops asking past the ceiling', () => {
    expect(requiredNotes(400)).toBe(MAX_REQUIRED_NOTES);
  });
});

describe('isRestatedNote', () => {
  it('drops a note that is the rendering again', () => {
    expect(isRestatedNote('I am waking up', 'I am waking up', 'Uyanıyorum')).toBe(true);
  });

  it('drops a note that is the original again', () => {
    expect(isRestatedNote('Uyanıyorum!', 'I am waking up', 'Uyanıyorum')).toBe(true);
  });

  it('drops a wrapper that adds nothing of its own', () => {
    expect(isRestatedNote('Literally: I am waking up', 'I am waking up', 'Uyanıyorum')).toBe(true);
  });

  it('drops a note too short to say anything', () => {
    expect(isRestatedNote('ok', 'I am waking up', 'Uyanıyorum')).toBe(true);
  });

  it('keeps a note that names what the literal reading would have lost', () => {
    expect(
      isRestatedNote(
        'Düz çeviri "küle dönüyorum" derdi; şarkı patlamayla açılıyor, satır da onunla açılmalı',
        'I am waking up',
        'Uyanıyorum',
      ),
    ).toBe(false);
  });

  it('keeps a real note that happens to quote the line inside a longer sentence', () => {
    expect(
      isRestatedNote(
        'I am waking up keeps the present tense the Turkish line leans on',
        'I am waking up',
        'Uyanıyorum',
      ),
    ).toBe(false);
  });
});

describe('gradeDraft', () => {
  it('passes a draft that meets the bar', () => {
    const grade = gradeDraft(facts());
    expect(grade.verdict).toBe('publishable');
    expect(grade.flaws).toEqual([]);
  });

  it('calls a draft thin when it is short of notes', () => {
    const grade = gradeDraft(facts({ notedLines: 1, taggedLines: 1 }));
    expect(grade.verdict).toBe('thin');
    expect(grade.flaws).toContain('too-few-notes');
  });

  it('calls a draft thin when notes came back untagged', () => {
    const grade = gradeDraft(facts({ notedLines: 4, taggedLines: 2 }));
    expect(grade.verdict).toBe('thin');
    expect(grade.flaws).toContain('untagged-notes');
  });

  it('calls a draft thin when the feel profile is missing', () => {
    const grade = gradeDraft(facts({ hasFeelProfile: false }));
    expect(grade.verdict).toBe('thin');
    expect(grade.flaws).toContain('no-feel-profile');
  });

  it('refuses a draft that handed most of the source back', () => {
    const grade = gradeDraft(facts({ echoedLines: 15 }));
    expect(grade.verdict).toBe('rejected');
    expect(grade.flaws).toContain('echoed-source');
  });

  it('tolerates echoes up to the limit', () => {
    const grade = gradeDraft(facts({ echoedLines: 10 }));
    expect(grade.verdict).toBe('publishable');
  });

  it('does not judge the echo ratio on a handful of lines', () => {
    const grade = gradeDraft(
      facts({ lineCount: 3, translatableLines: 3, echoedLines: 3, notedLines: 3, taggedLines: 3 }),
    );
    expect(grade.verdict).not.toBe('rejected');
  });

  it('treats an all-ad-lib block as having no echo evidence', () => {
    const grade = gradeDraft(facts({ translatableLines: 0, echoedLines: 0 }));
    expect(grade.echoRatio).toBe(0);
    expect(grade.verdict).toBe('publishable');
  });

  it('summarises itself in one line', () => {
    expect(gradeDraft(facts()).summary).toContain('3/3 noted');
  });
});
