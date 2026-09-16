/**
 * URL slugs.
 *
 * Song titles arrive in Turkish, Spanish, Portuguese, Italian and German, so the
 * transliteration table has to cover more than the usual ASCII fold — a naive
 * `normalize('NFD')` turns "ı" into "ı" (it has no combining mark to strip) and
 * leaves "ß" untouched. Both would end up dropped from the slug, silently
 * colliding "Şımarık" with "Smark".
 */

const TRANSLITERATIONS: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ç: 'c',
  Ç: 'c',
  ö: 'o',
  Ö: 'o',
  ü: 'u',
  Ü: 'u',
  ñ: 'n',
  Ñ: 'n',
  ß: 'ss',
  æ: 'ae',
  Æ: 'ae',
  ø: 'o',
  Ø: 'o',
  å: 'a',
  Å: 'a',
  œ: 'oe',
  Œ: 'oe',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
};

const MAX_SLUG_LENGTH = 96;

export function slugify(input: string): string {
  const transliterated = Array.from(input)
    .map((char) => TRANSLITERATIONS[char] ?? char)
    .join('');

  return transliterated
    .normalize('NFD')
    // Strip combining diacritical marks left over after decomposition.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * The canonical slug for a song. The language pair is part of the identity:
 * "Şımarık" exists as both TR→EN and TR→ES, and they are different artefacts
 * with different notes, so they need different URLs.
 */
export function songSlug(
  artist: string,
  title: string,
  source: string,
  target: string,
): string {
  const base = slugify(`${artist} ${title}`);
  const pair = slugify(`${source} ${target}`);
  return `${base}-${pair}`;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return (
    value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value)
  );
}
