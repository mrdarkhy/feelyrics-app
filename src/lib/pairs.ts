import {
  groupingLanguage,
  isLanguageCode,
  isTargetLanguage,
} from '@/domain/shared/language';
import type { LanguageCode, LanguagePair, TargetLanguage } from '@/domain/shared/language';

/**
 * Language pairs as URL segments.
 *
 * A pair gets its own page because that is how people actually search — "İtalyanca
 * şarkı çevirileri", "canciones en francés traducidas" — and a page that answers
 * exactly that question outranks a filter state on the library page, which a
 * crawler cannot reach at all.
 *
 * The separator is `-to-` rather than `-`, because `pt-br` already contains a
 * hyphen and `pt-br-tr` has two readings. Codes rather than language names keeps
 * one URL per pair across all three interface languages, which is what makes the
 * `hreflang` set honest.
 */

const SEPARATOR = '-to-';

export function pairSlug(pair: LanguagePair): string {
  return `${groupingLanguage(pair.source)}${SEPARATOR}${pair.target}`;
}

export function parsePairSlug(slug: string): LanguagePair | null {
  const index = slug.indexOf(SEPARATOR);
  if (index <= 0) return null;

  const source = slug.slice(0, index);
  const target = slug.slice(index + SEPARATOR.length);

  if (!isLanguageCode(source) || !isTargetLanguage(target)) return null;
  if (source === target) return null;

  return { source, target };
}

/** Every pair present in a set of songs, each one once, in a stable order. */
export function distinctPairs(
  songs: readonly { source: LanguageCode; target: TargetLanguage }[],
): readonly LanguagePair[] {
  const seen = new Map<string, LanguagePair>();

  for (const song of songs) {
    const pair: LanguagePair = {
      source: groupingLanguage(song.source),
      target: song.target,
    };
    const key = pairSlug(pair);
    if (!seen.has(key)) seen.set(key, pair);
  }

  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, p]) => p);
}
