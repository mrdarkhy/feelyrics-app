import { describe, expect, it } from 'vitest';
import { decodeSharePackage, encodeSharePackage } from '@/lib/share-link';
import { toSharePackage } from '@/domain/song/share-package';
import { isErr, isOk, unwrap } from '@/domain/shared/result';
import type { Song } from '@/domain/song/song';

function makeSong(lineCount = 3): Song {
  return {
    id: 'song-1',
    slug: 'tarkan-simarik-tr-en',
    title: 'Şımarık',
    artist: 'Tarkan',
    pair: { source: 'tr', target: 'en' },
    engineVersion: '0.1.1',
    feelProfile: 'flirtatious scolding',
    provenance: 'user-paste',
    requestedBy: 'a friend',
    validatedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sections: [
      {
        id: 'verse',
        position: 0,
        label: 'Verse 1',
        lines: Array.from({ length: lineCount }, (_, index) => ({
          id: `line-${index}`,
          position: index,
          original: `Takmış koluna elin adamını ${index}`,
          rendering: `Struttin' around arm in arm with some random guy ${index}`,
          note: 'Register twin — "elin adamı" is dismissive folk speech.',
          tags: ['register', 'cultural-code'] as const,
        })),
      },
    ],
  };
}

describe('share link codec', () => {
  it('round-trips a song through the fragment', () => {
    const encoded = unwrap(encodeSharePackage(toSharePackage(makeSong())));
    const decoded = unwrap(decodeSharePackage(encoded));

    expect(decoded.title).toBe('Şımarık');
    expect(decoded.artist).toBe('Tarkan');
    expect(decoded.pair).toEqual({ source: 'tr', target: 'en' });
    expect(decoded.feelProfile).toBe('flirtatious scolding');
    expect(decoded.requestedBy).toBe('a friend');
    expect(decoded.sections[0]?.lines).toHaveLength(3);
    expect(decoded.sections[0]?.lines[0]?.tags).toEqual(['register', 'cultural-code']);
  });

  it('survives non-Latin text, which is most of the catalogue', () => {
    const song = makeSong(1);
    const withUnicode: Song = {
      ...song,
      sections: [
        {
          ...song.sections[0]!,
          lines: [
            {
              ...song.sections[0]!.lines[0]!,
              original: '私を怒らせないで欲しい — ¿Dónde queda mi hombría?',
              rendering: 'Ağzında sakızı şişirip şişirip',
            },
          ],
        },
      ],
    };

    const encoded = unwrap(encodeSharePackage(toSharePackage(withUnicode)));
    const decoded = unwrap(decodeSharePackage(encoded));

    expect(decoded.sections[0]?.lines[0]?.original).toBe(
      '私を怒らせないで欲しい — ¿Dónde queda mi hombría?',
    );
    expect(decoded.sections[0]?.lines[0]?.rendering).toBe(
      'Ağzında sakızı şişirip şişirip',
    );
  });

  it('accepts a bare payload, a #fragment, or a whole URL', () => {
    const encoded = unwrap(encodeSharePackage(toSharePackage(makeSong(1))));

    for (const input of [
      encoded,
      `#${encoded}`,
      `https://feelyrics.app/tr/s#${encoded}`,
    ]) {
      expect(isOk(decodeSharePackage(input))).toBe(true);
    }
  });

  it('keeps a full song inside the URL length budget', () => {
    // A 60-line song with a note on every line is about as heavy as the
    // catalogue gets; if that does not fit, sharing silently stops working.
    const encoded = unwrap(encodeSharePackage(toSharePackage(makeSong(60))));
    expect(encoded.length).toBeLessThan(24_000);
  });

  it('rejects a truncated link rather than rendering half a song', () => {
    const encoded = unwrap(encodeSharePackage(toSharePackage(makeSong())));
    const result = decodeSharePackage(encoded.slice(0, encoded.length - 40));
    expect(isErr(result)).toBe(true);
  });

  it('rejects payloads that are not base64url', () => {
    expect(isErr(decodeSharePackage('f1.not a payload!!'))).toBe(true);
    expect(isErr(decodeSharePackage(''))).toBe(true);
  });

  it('rejects a payload from a future format version', () => {
    // Someone opening an old build should be told the link cannot be read, not
    // shown a half-parsed song.
    const encoded = unwrap(
      encodeSharePackage({ ...toSharePackage(makeSong()), v: 99 }),
    );
    const result = decodeSharePackage(encoded);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('share_payload_invalid');
  });

  it('rejects a payload with an unknown language pair', () => {
    const encoded = unwrap(
      encodeSharePackage({ ...toSharePackage(makeSong()), tgt: 'klingon' }),
    );
    expect(isErr(decodeSharePackage(encoded))).toBe(true);
  });

  it('drops unknown reason tags instead of trusting them', () => {
    const pkg = toSharePackage(makeSong(1));
    const tampered = {
      ...pkg,
      sections: [
        {
          k: 'Verse',
          l: [{ o: 'a', t: 'b', g: ['register', 'made-up-tag', '<script>'] }],
        },
      ],
    };

    const decoded = unwrap(decodeSharePackage(unwrap(encodeSharePackage(tampered))));
    expect(decoded.sections[0]?.lines[0]?.tags).toEqual(['register']);
  });
});
