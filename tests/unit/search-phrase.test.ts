import { describe, expect, it } from 'vitest';
import {
  PHRASE_COMBINATIONS,
  defaultLocaleFor,
  primaryLocaleFor,
  searchPhrase,
  songMetaDescription,
  songMetaTitle,
} from '@/domain/song/search-phrase';
import { TARGET_LANGUAGES, UI_LOCALES } from '@/domain/shared/language';
import type { UiLocale } from '@/domain/shared/language';

/**
 * The song page's search surface.
 *
 * These are copy tests, which is unusual, but this particular copy is the whole
 * point of the page: if the title stops containing the phrase somebody types,
 * the page stops being findable and nothing else in the app notices.
 */

const SONG = {
  title: 'Ohne Dich',
  artist: 'Rammstein',
  feelProfile: 'Ayrılıktan sonra kalan boşluğun sesi: nefes var, hayat yok.',
} as const;

describe('searchPhrase', () => {
  it('covers every interface language × target language', () => {
    expect(PHRASE_COMBINATIONS).toHaveLength(
      UI_LOCALES.length * TARGET_LANGUAGES.length,
    );

    for (const [locale, target] of PHRASE_COMBINATIONS) {
      const phrase = searchPhrase(locale, target);
      expect(phrase.query.length, `${locale}/${target}`).toBeGreaterThan(0);
      expect(phrase.language.length, `${locale}/${target}`).toBeGreaterThan(0);
    }
  });

  it('carries the word people actually search with, in the page language', () => {
    const word: Record<UiLocale, RegExp> = {
      en: /translation/i,
      tr: /çeviri/i,
      es: /traducci|letra/i,
    };

    for (const [locale, target] of PHRASE_COMBINATIONS) {
      expect(searchPhrase(locale, target).query, `${locale}/${target}`).toMatch(
        word[locale],
      );
    }
  });

  it('promises a meaning, which is the query the lyric sites do not answer', () => {
    const meaning: Record<UiLocale, RegExp> = {
      en: /meaning/i,
      tr: /anlam/i,
      es: /significado/i,
    };

    for (const [locale, target] of PHRASE_COMBINATIONS) {
      expect(searchPhrase(locale, target).query).toMatch(meaning[locale]);
    }
  });

  it('names the target language, not the source', () => {
    expect(searchPhrase('en', 'tr').query).toContain('Turkish');
    expect(searchPhrase('tr', 'en').query).toContain('İngilizce');
    expect(searchPhrase('es', 'es').query).toContain('español');
  });
});

describe('songMetaTitle', () => {
  it('holds the song, the artist and the phrase', () => {
    for (const [locale, target] of PHRASE_COMBINATIONS) {
      const title = songMetaTitle({ locale, target, ...SONG });
      expect(title).toContain(SONG.title);
      expect(title).toContain(SONG.artist);
      expect(title).toContain(searchPhrase(locale, target).query);
    }
  });

  it('puts the artist first in Turkish and the song first in English', () => {
    expect(songMetaTitle({ locale: 'tr', target: 'tr', ...SONG })).toMatch(
      /^Rammstein – Ohne Dich:/,
    );
    expect(songMetaTitle({ locale: 'en', target: 'tr', ...SONG })).toMatch(
      /^Ohne Dich by Rammstein/,
    );
  });

  it('stays short enough to survive the site-name suffix', () => {
    for (const [locale, target] of PHRASE_COMBINATIONS) {
      const full = `${songMetaTitle({ locale, target, ...SONG })} · Feelyrics`;
      expect(full.length, `${locale}/${target}`).toBeLessThanOrEqual(75);
    }
  });
});

describe('songMetaDescription', () => {
  it('leads with the feel profile where the page speaks the target language', () => {
    const description = songMetaDescription({
      locale: 'tr',
      target: 'tr',
      ...SONG,
    });
    expect(description.startsWith(SONG.feelProfile)).toBe(true);
  });

  it('never drops the target language into a page that does not speak it', () => {
    const description = songMetaDescription({
      locale: 'en',
      target: 'tr',
      ...SONG,
    });
    expect(description).not.toContain(SONG.feelProfile);
    expect(description).toContain('Turkish');
  });

  it('falls back to the template when a song has no feel profile yet', () => {
    const description = songMetaDescription({
      locale: 'tr',
      target: 'tr',
      title: SONG.title,
      artist: SONG.artist,
      feelProfile: null,
    });
    expect(description).toContain(SONG.title);
    expect(description).toContain('Türkçe');
  });

  it('fits a search snippet and cuts at a word, not mid-word', () => {
    const long = `${'his çevirisi '.repeat(40)}son`;
    const description = songMetaDescription({
      locale: 'tr',
      target: 'tr',
      title: SONG.title,
      artist: SONG.artist,
      feelProfile: long,
    });

    expect(description.length).toBeLessThanOrEqual(165);
    expect(description.endsWith('…')).toBe(true);
    expect(description).not.toMatch(/\s…$/);

    for (const [locale, target] of PHRASE_COMBINATIONS) {
      expect(
        songMetaDescription({ locale, target, ...SONG }).length,
        `${locale}/${target}`,
      ).toBeLessThanOrEqual(165);
    }
  });
});

describe('primaryLocaleFor', () => {
  it('sends a song to the page that speaks the language it was translated into', () => {
    expect(primaryLocaleFor('tr')).toBe('tr');
    expect(primaryLocaleFor('en')).toBe('en');
    expect(primaryLocaleFor('es')).toBe('es');
  });

  it('admits that Brazilian Portuguese has readers and no interface', () => {
    expect(primaryLocaleFor('pt-br')).toBeNull();
    expect(defaultLocaleFor('pt-br')).toBe('en');
  });
});
