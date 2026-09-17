import { describe, expect, it } from 'vitest';
import { isErr, isOk, unwrap } from '@/domain/shared/result';
import { isValidSlug, slugify, songSlug } from '@/domain/shared/slug';
import { groupingLanguage, parsePair, toBcp47 } from '@/domain/shared/language';
import { normaliseTags, splitLegacyNote } from '@/domain/song/reason-tag';
import {
  canTransition,
  transition,
  validateNewRequest,
} from '@/domain/request/song-request';
import type { SongRequest } from '@/domain/request/song-request';
import {
  reviewSuggestion,
  toPreferencePair,
  validateNewSuggestion,
} from '@/domain/suggestion/suggestion';
import type { Suggestion } from '@/domain/suggestion/suggestion';

describe('slugs', () => {
  it('transliterates Turkish letters that NFD cannot decompose', () => {
    // "ı" carries no combining mark, so a naive fold drops it entirely and
    // "Şımarık" collides with "Smark".
    expect(slugify('Şımarık')).toBe('simarik');
    expect(slugify('Yiğidim Aslanım')).toBe('yigidim-aslanim');
    expect(slugify('Çok Güzel Gülüyorsun')).toBe('cok-guzel-guluyorsun');
  });

  it('handles the other source languages', () => {
    expect(slugify('Non, Je Ne Regrette Rien')).toBe('non-je-ne-regrette-rien');
    expect(slugify('Canzone d’Amore')).toBe('canzone-d-amore');
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Niño')).toBe('nino');
  });

  it('puts the language pair in the slug so both directions can coexist', () => {
    const toEnglish = songSlug('Tarkan', 'Şımarık', 'tr', 'en');
    const toSpanish = songSlug('Tarkan', 'Şımarık', 'tr', 'es');

    expect(toEnglish).not.toBe(toSpanish);
    expect(isValidSlug(toEnglish)).toBe(true);
    expect(isValidSlug(toSpanish)).toBe(true);
  });

  it('never emits a trailing or doubled separator', () => {
    expect(slugify('pa ti toa <3')).toBe('pa-ti-toa-3');
    expect(slugify('!!!')).toBe('');
    expect(isValidSlug(slugify('Hello --- World'))).toBe(true);
  });
});

describe('language pairs', () => {
  it('parses the legacy display form', () => {
    expect(parsePair('ES→TR')).toEqual({ source: 'es', target: 'tr' });
    expect(parsePair('PT-BR→EN')).toEqual({ source: 'pt-br', target: 'en' });
  });

  it('rejects nonsense and same-language pairs', () => {
    expect(parsePair('ES')).toBeNull();
    expect(parsePair('XX→TR')).toBeNull();
    expect(parsePair('ES→NAP')).toBeNull();
    expect(parsePair('TR→TR')).toBeNull();
  });

  it('files Neapolitan under Italian for browsing, without changing the song', () => {
    expect(groupingLanguage('nap')).toBe('it');
    expect(groupingLanguage('es')).toBe('es');
    expect(toBcp47('nap')).toBe('nap');
    expect(toBcp47('pt-br')).toBe('pt-BR');
  });
});

describe('reason tags', () => {
  it('reads tags out of a legacy Turkish note', () => {
    const { text, tags } = splitLegacyNote(
      'Söyleniş-sırası: vurgu önce düşer. [prozodi · literal-tercih]',
    );
    expect(text).toBe('Söyleniş-sırası: vurgu önce düşer.');
    expect(tags).toEqual(['prosody', 'literal-wins']);
  });

  it('reads Spanish and English tag spellings too', () => {
    expect(splitLegacyNote('x [registro · metáfora]').tags).toEqual([
      'register',
      'metaphor',
    ]);
    expect(splitLegacyNote('x [feel · sung-order]').tags).toEqual([
      'feel',
      'sung-order',
    ]);
  });

  it('leaves a note without a tag block alone', () => {
    const { text, tags } = splitLegacyNote('Just a note.');
    expect(text).toBe('Just a note.');
    expect(tags).toEqual([]);
  });

  it('drops unknown tags and duplicates, and caps the list', () => {
    expect(normaliseTags(['feel', 'feel', 'nonsense', 42, null])).toEqual(['feel']);
    expect(
      normaliseTags(['feel', 'register', 'metaphor', 'prosody', 'cultural-code']),
    ).toHaveLength(4);
  });
});

describe('song requests', () => {
  it('queues a request that arrives with lyrics, and holds one that does not', () => {
    const withLyrics = unwrap(
      validateNewRequest({
        title: 'Sebebi Yar',
        artist: 'BLOK3',
        targets: ['en', 'es'],
        hasLyrics: true,
      }),
    );
    expect(withLyrics.status).toBe('queued');

    const withoutLyrics = unwrap(
      validateNewRequest({ title: 'Sebebi Yar', artist: 'BLOK3', targets: ['en'] }),
    );
    expect(withoutLyrics.status).toBe('lyrics-needed');
  });

  it('rejects an empty or unsupported target list', () => {
    const none = validateNewRequest({ title: 'x', artist: 'y', targets: [] });
    expect(isErr(none)).toBe(true);

    const bogus = validateNewRequest({ title: 'x', artist: 'y', targets: ['klingon'] });
    expect(isErr(bogus)).toBe(true);
  });

  it('requires a title and an artist', () => {
    expect(isErr(validateNewRequest({ title: '  ', artist: 'y', targets: ['en'] }))).toBe(
      true,
    );
    expect(isErr(validateNewRequest({ title: 'x', artist: '', targets: ['en'] }))).toBe(
      true,
    );
  });

  it('will not let a request skip straight from needing lyrics to ready', () => {
    // The whole user-paste rule depends on this transition being impossible.
    expect(canTransition('lyrics-needed', 'ready')).toBe(false);
    expect(canTransition('lyrics-needed', 'queued')).toBe(true);
    expect(canTransition('queued', 'ready')).toBe(true);
  });

  it('will not mark a request ready without a published song', () => {
    const request: SongRequest = {
      id: 'r1',
      title: 'x',
      artist: 'y',
      targets: ['en'],
      requesterAlias: null,
      requesterNote: null,
      hasLyrics: true,
      lyricLineCount: null,
      pastedLyrics: null,
      status: 'queued',
      songSlug: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(isErr(transition(request, 'ready'))).toBe(true);
    expect(isOk(transition(request, 'ready', 'artist-title-tr-en'))).toBe(true);
  });
});

describe('suggestions', () => {
  const base = {
    songId: 's1',
    lineId: 'l1',
    originalLine: 'Yakalarsam',
    engineDraft: 'Just wait till I catch you',
  };

  it('requires at least one reason tag', () => {
    const result = validateNewSuggestion({
      ...base,
      proposedRendering: 'If I catch you, muck muck',
      tags: [],
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('missing_reason_tag');
  });

  it('rejects a suggestion identical to the current rendering', () => {
    const result = validateNewSuggestion({
      ...base,
      proposedRendering: base.engineDraft,
      tags: ['feel'],
    });
    expect(isErr(result)).toBe(true);
  });

  it('accepts a tagged alternative', () => {
    const value = unwrap(
      validateNewSuggestion({
        ...base,
        proposedRendering: 'If I catch you, muck muck',
        tags: ['feel', 'literal-wins', 'bogus'],
        contributorAlias: '  alexander  ',
      }),
    );

    expect(value.tags).toEqual(['feel', 'literal-wins']);
    expect(value.contributorAlias).toBe('alexander');
  });

  const suggestion: Suggestion = {
    id: 'g1',
    songId: 's1',
    lineId: 'l1',
    originalLine: 'Yakalarsam',
    engineDraft: 'Just wait till I catch you',
    proposedRendering: 'If I catch you, muck muck',
    tags: ['feel'],
    comment: null,
    contributorAlias: 'alexander',
    status: 'proposed',
    reviewNote: null,
    createdAt: new Date(),
    reviewedAt: null,
  };

  it('demands a written reason before marking a line disputed', () => {
    expect(isErr(reviewSuggestion(suggestion, 'disputed'))).toBe(true);
    expect(isOk(reviewSuggestion(suggestion, 'disputed', 'Two natives disagree.'))).toBe(
      true,
    );
  });

  it('exports an accepted suggestion as a preference pair', () => {
    const accepted = unwrap(reviewSuggestion(suggestion, 'accepted'));
    const pair = toPreferencePair(accepted);

    expect(pair).toEqual({
      prompt: 'Yakalarsam',
      chosen: 'If I catch you, muck muck',
      rejected: 'Just wait till I catch you',
      tags: ['feel'],
      songId: 's1',
      lineId: 'l1',
    });
  });

  it('exports nothing for a suggestion that was not accepted', () => {
    expect(toPreferencePair(suggestion)).toBeNull();
  });
});
