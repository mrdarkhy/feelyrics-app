/**
 * Languages, in two distinct roles.
 *
 * `UiLocale` is the language the *interface* speaks — the three locales the app
 * is translated into.
 *
 * `LanguageCode` is the language a *song* is in. It is a wider set: a song can
 * come from Neapolitan even though the UI will never be Neapolitan.
 *
 * The two are deliberately separate types. Conflating them is how you end up
 * trying to translate the navigation bar into Neapolitan.
 */

export const UI_LOCALES = ['en', 'tr', 'es'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_LOCALE: UiLocale = 'en';

export function isUiLocale(value: unknown): value is UiLocale {
  return (
    typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value)
  );
}

export const LANGUAGE_CODES = [
  'en',
  'tr',
  'es',
  'pt-br',
  'it',
  'fr',
  'de',
  'nap',
] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === 'string' &&
    (LANGUAGE_CODES as readonly string[]).includes(value)
  );
}

/**
 * Languages a song can be translated *into*. Narrower than the source set,
 * because a target language needs a reader: we only publish into languages the
 * app itself speaks, plus Brazilian Portuguese, where the first validator was.
 */
export const TARGET_LANGUAGES = ['tr', 'en', 'es', 'pt-br'] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export function isTargetLanguage(value: unknown): value is TargetLanguage {
  return (
    typeof value === 'string' &&
    (TARGET_LANGUAGES as readonly string[]).includes(value)
  );
}

/**
 * A translation direction, e.g. Spanish → Turkish.
 *
 * Same-language pairs are rejected: "translating" a song into its own language
 * is not a Feelyrics artefact, it is a typo.
 */
export interface LanguagePair {
  readonly source: LanguageCode;
  readonly target: TargetLanguage;
}

export function formatPair(pair: LanguagePair): string {
  return `${pair.source.toUpperCase()}→${pair.target.toUpperCase()}`;
}

/**
 * Parses the display form used throughout the legacy catalogue ("ES→TR").
 * Returns `null` rather than throwing so callers can decide what a bad pair means.
 */
export function parsePair(value: string): LanguagePair | null {
  const [rawSource, rawTarget] = value.split('→');
  if (!rawSource || !rawTarget) return null;

  const source = rawSource.trim().toLowerCase();
  const target = rawTarget.trim().toLowerCase();

  if (!isLanguageCode(source) || !isTargetLanguage(target)) return null;
  if (source === target) return null;

  return { source, target };
}

/**
 * Neapolitan songs are grouped under Italian in the library: a reader browsing
 * "from Italian" expects to find Caruso there, and a separate one-item bucket
 * would read as a bug rather than as precision. The song itself keeps its true
 * source language — only the grouping folds.
 */
export function groupingLanguage(code: LanguageCode): LanguageCode {
  return code === 'nap' ? 'it' : code;
}

/**
 * The BCP-47 tag for a song language, used for `lang` attributes so screen
 * readers switch pronunciation on the original lines.
 */
export function toBcp47(code: LanguageCode): string {
  switch (code) {
    case 'pt-br':
      return 'pt-BR';
    case 'nap':
      return 'nap';
    default:
      return code;
  }
}
