import { describe, expect, it } from 'vitest';
import {
  baseTitle,
  buildFallbackQuery,
  buildSearchQuery,
  matchTrack,
  normalizeForMatch,
  scoreCandidate,
} from '@/domain/song/spotify-match';
import type { TrackCandidate } from '@/domain/song/spotify-match';
import { formatDuration, lookupCopy } from '@/lib/spotify-search-copy';
import { UI_LOCALES } from '@/domain/shared/language';

/**
 * Track matching.
 *
 * The thing under test is a refusal as much as a choice: attaching the wrong
 * recording makes the sync drift against a track nobody picked, and the reader
 * reads that as a broken product rather than as a guess. So most of these
 * assertions are about what the matcher declines to be confident about.
 */

function track(partial: Partial<TrackCandidate> & { id: string; name: string }): TrackCandidate {
  return {
    artists: [],
    albumName: '',
    durationMs: 210_000,
    artworkUrl: null,
    popularity: 50,
    ...partial,
  };
}

describe('normalisation', () => {
  it('folds diacritics, because the two sides never agree about them', () => {
    expect(normalizeForMatch('Şımarık')).toBe('simarik');
    expect(normalizeForMatch('Gülpembe')).toBe('gulpembe');
    expect(normalizeForMatch('Corazón')).toBe('corazon');
  });

  it('drops featuring markers', () => {
    expect(normalizeForMatch('Bury a Friend feat. Someone')).toBe('bury a friend someone');
    expect(normalizeForMatch('Track ft. X')).toBe('track x');
  });

  it('strips the suffix that names a different mix', () => {
    expect(baseTitle('Ohne Dich (Remastered 2011)')).toBe('Ohne Dich');
    expect(baseTitle('Radioactive - Radio Edit')).toBe('Radioactive');
    expect(baseTitle('Gülpembe')).toBe('Gülpembe');
  });

  it('keeps a title that is only a parenthetical', () => {
    expect(baseTitle('(Intro)')).toBe('(Intro)');
  });
});

describe('scoring', () => {
  const query = { title: 'Şımarık', artist: 'Tarkan' };

  it('rates the plain studio track above every variant of it', () => {
    const studio = track({ id: 'a', name: 'Şımarık', artists: ['Tarkan'] });
    const live = track({ id: 'b', name: 'Şımarık - Live', artists: ['Tarkan'] });
    const remix = track({ id: 'c', name: 'Şımarık (Club Remix)', artists: ['Tarkan'] });

    expect(scoreCandidate(query, studio)).toBeGreaterThan(scoreCandidate(query, live));
    expect(scoreCandidate(query, studio)).toBeGreaterThan(scoreCandidate(query, remix));
  });

  it('rejects karaoke and tribute releases outright', () => {
    // These copy the title and the artist name into their own metadata, so they
    // score well on every signal and have to be excluded by name.
    expect(
      scoreCandidate(query, track({ id: 'k', name: 'Şımarık', artists: ['Karaoke Kings'] })),
    ).toBeLessThan(0);
    expect(
      scoreCandidate(
        query,
        track({ id: 't', name: 'Şımarık', artists: ['Made Famous By Tarkan'] }),
      ),
    ).toBeLessThan(0);
  });

  it('rejects a track that merely shares a word with the title', () => {
    expect(
      scoreCandidate(
        { title: 'Nothing Else Matters', artist: 'Metallica' },
        track({ id: 'x', name: 'Nothing', artists: ['Someone'] }),
      ),
    ).toBeLessThan(0);
  });

  it('penalises the right artist name being absent', () => {
    const right = track({ id: 'a', name: 'Gülpembe', artists: ['Barış Manço'] });
    const wrong = track({ id: 'b', name: 'Gülpembe', artists: ['Another Singer'] });
    const q = { title: 'Gülpembe', artist: 'Barış Manço' };
    expect(scoreCandidate(q, right) - scoreCandidate(q, wrong)).toBeGreaterThanOrEqual(90);
  });

  it('does not punish a variant the query itself asked for', () => {
    const q = { title: 'Ohne Dich - Live', artist: 'Rammstein' };
    const live = track({ id: 'a', name: 'Ohne Dich - Live', artists: ['Rammstein'] });
    expect(scoreCandidate(q, live)).toBeGreaterThan(140);
  });
});

describe('matching', () => {
  it('is confident when one track is clearly the song', () => {
    const result = matchTrack({ title: 'Şımarık', artist: 'Tarkan' }, [
      track({ id: 'a', name: 'Şımarık', artists: ['Tarkan'], popularity: 70 }),
      track({ id: 'b', name: 'Şımarık - Live', artists: ['Tarkan'], popularity: 20 }),
    ]);

    expect(result.best?.id).toBe('a');
    expect(result.confidence).toBe('high');
  });

  it('is never confident without an artist, however good the title', () => {
    const result = matchTrack({ title: 'Şımarık', artist: '' }, [
      track({ id: 'a', name: 'Şımarık', artists: ['Tarkan'] }),
    ]);

    expect(result.best?.id).toBe('a');
    expect(result.confidence).toBe('low');
  });

  it('asks a person when two recordings score the same', () => {
    const result = matchTrack({ title: 'Gülpembe', artist: 'Barış Manço' }, [
      track({ id: 'a', name: 'Gülpembe', artists: ['Barış Manço'], popularity: 60 }),
      track({ id: 'b', name: 'Gülpembe', artists: ['Barış Manço'], popularity: 58 }),
    ]);

    expect(result.confidence).toBe('low');
    expect(result.alternatives.map((c) => c.id)).toContain('b');
  });

  it('returns nothing rather than the least bad row', () => {
    const result = matchTrack({ title: 'Yiğidim Aslanım', artist: 'Zeki Müren' }, [
      track({ id: 'x', name: 'Something Else Entirely', artists: ['Nobody'] }),
    ]);

    expect(result.best).toBeNull();
    expect(result.alternatives).toHaveLength(0);
  });

  it('survives an empty result set', () => {
    const result = matchTrack({ title: 'A', artist: 'B' }, []);
    expect(result.best).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('never offers more than a shortlist', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      track({ id: `t${i}`, name: 'Romantik', artists: ['Barış Manço'], popularity: 50 - i }),
    );
    const result = matchTrack({ title: 'Romantik', artist: 'Barış Manço' }, many);
    expect(result.alternatives.length).toBeLessThanOrEqual(4);
  });
});

describe('the query sent to Spotify', () => {
  it('uses field filters so album names do not bury the track', () => {
    expect(buildSearchQuery({ title: 'Ohne Dich (Remastered)', artist: 'Rammstein' })).toBe(
      'track:"Ohne Dich" artist:"Rammstein"',
    );
  });

  it('drops the artist filter when there is no artist', () => {
    expect(buildSearchQuery({ title: 'Guantanamera', artist: '' })).toBe(
      'track:"Guantanamera"',
    );
  });

  it('never lets a quote break out of the filter', () => {
    const q = buildSearchQuery({ title: 'She said "no"', artist: 'X' });
    expect(q.match(/"/g)).toHaveLength(4);
  });

  it('falls back to plain words, which is what Spotify is good at', () => {
    expect(buildFallbackQuery({ title: 'Gülpembe (Live)', artist: 'Barış Manço' })).toBe(
      'Gülpembe Barış Manço',
    );
  });
});

describe('panel copy', () => {
  it('speaks all three interface languages', () => {
    for (const locale of UI_LOCALES) {
      const copy = lookupCopy(locale);
      for (const [key, value] of Object.entries(copy)) {
        expect(value.length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('falls back to English for an unknown locale', () => {
    expect(lookupCopy('de')).toEqual(lookupCopy('en'));
  });

  it('formats a duration the way a player does', () => {
    expect(formatDuration(227_000)).toBe('3:47');
    expect(formatDuration(59_000)).toBe('0:59');
    expect(formatDuration(0)).toBe('');
  });
});
