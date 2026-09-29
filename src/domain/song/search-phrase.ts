import {
  DEFAULT_LOCALE,
  TARGET_LANGUAGES,
  UI_LOCALES,
} from '../shared/language';
import type { TargetLanguage, UiLocale } from '../shared/language';

/**
 * The words a song page is found by.
 *
 * Nobody searches for "German → Turkish feel-translation". They search for
 * "ohne dich türkçe çeviri", "gülpembe english translation meaning",
 * "la camisa negra letra en español". The title of a song page has to contain
 * that phrase, in the language of the page, or the page is invisible for the one
 * query it exists to answer.
 *
 * This lives in the domain rather than in the message catalogue for two reasons.
 * It varies along *two* axes — the language the page speaks and the language the
 * song was translated into, twelve combinations — which ICU messages express
 * badly. And it is the kind of copy that should be covered by tests rather than
 * by somebody remembering to check all three files.
 */

interface Phrase {
  /** The search phrase itself, as it goes in the <title>. */
  readonly query: string;
  /** The target language's name in the page's language, for prose. */
  readonly language: string;
}

/** Page language → song's target language → phrase. */
const PHRASES: Record<UiLocale, Record<TargetLanguage, Phrase>> = {
  en: {
    en: { query: 'English translation & meaning', language: 'English' },
    tr: { query: 'Turkish translation & meaning', language: 'Turkish' },
    es: { query: 'Spanish translation & meaning', language: 'Spanish' },
    'pt-br': {
      query: 'Portuguese translation & meaning',
      language: 'Portuguese',
    },
  },
  tr: {
    en: { query: 'İngilizce çeviri ve anlamı', language: 'İngilizce' },
    tr: { query: 'Türkçe çeviri ve anlamı', language: 'Türkçe' },
    es: { query: 'İspanyolca çeviri ve anlamı', language: 'İspanyolca' },
    'pt-br': { query: 'Portekizce çeviri ve anlamı', language: 'Portekizce' },
  },
  es: {
    en: { query: 'traducción al inglés y significado', language: 'inglés' },
    tr: { query: 'traducción al turco y significado', language: 'turco' },
    es: { query: 'letra en español y significado', language: 'español' },
    'pt-br': {
      query: 'traducción al portugués y significado',
      language: 'portugués',
    },
  },
};

export function searchPhrase(
  locale: UiLocale,
  target: TargetLanguage,
): Phrase {
  return PHRASES[locale][target];
}

export interface SongMetaInput {
  readonly locale: UiLocale;
  readonly target: TargetLanguage;
  readonly title: string;
  readonly artist: string;
  /** One line naming the emotion the song runs on, in the **target** language. */
  readonly feelProfile?: string | null;
}

/**
 * The page title.
 *
 * Word order differs per language because a title is read, not assembled: a
 * Turkish reader expects the artist first, an English one the song first.
 * The layout appends " · Feelyrics", so these stay short.
 */
export function songMetaTitle({
  locale,
  target,
  title,
  artist,
}: SongMetaInput): string {
  const { query } = searchPhrase(locale, target);
  switch (locale) {
    case 'tr':
      return `${artist} – ${title}: ${query}`;
    case 'es':
      return `${title} de ${artist} — ${query}`;
    default:
      return `${title} by ${artist} — ${query}`;
  }
}

/** Roughly what a search result will show before it cuts the snippet off. */
const DESCRIPTION_BUDGET = 165;

/**
 * The page description.
 *
 * Where the page speaks the language the song was translated into, the feel
 * profile leads — it is the one sentence about *this* song that no template can
 * produce, and it is already written in the right language. Everywhere else the
 * profile would drop a Turkish sentence into an English snippet, so the template
 * stands on its own.
 */
export function songMetaDescription(input: SongMetaInput): string {
  const { locale, target, title, artist } = input;
  const { language } = searchPhrase(locale, target);
  const tail = TAILS[locale];

  const feel = input.feelProfile?.trim();
  if (feel && (locale as string) === (target as string)) {
    return clamp(`${feel} — ${tail}`, DESCRIPTION_BUDGET);
  }

  switch (locale) {
    case 'tr':
      return clamp(
        `${artist} imzalı ${title} şarkısı ne anlatıyor? Sözlerinin ${language} his çevirisi, satır satır — her tercihin gerekçesiyle.`,
        DESCRIPTION_BUDGET,
      );
    case 'es':
      return clamp(
        `Lo que ${title} de ${artist} dice de verdad en ${language}: traducción por el sentimiento, verso a verso, con la razón de cada elección.`,
        DESCRIPTION_BUDGET,
      );
    default:
      return clamp(
        `What ${title} by ${artist} actually says in ${language}: a feel-translation, line by line, with a note on the call behind each one.`,
        DESCRIPTION_BUDGET,
      );
  }
}

const TAILS: Record<UiLocale, string> = {
  en: 'the feel-translation, line by line, with a note on every call.',
  tr: 'his çevirisi satır satır, her kararın notuyla birlikte.',
  es: 'la traducción por el sentimiento, verso a verso, con cada decisión anotada.',
};

/** Cuts at a word boundary rather than mid-word, and never adds a bare ellipsis. */
function clamp(text: string, budget: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= budget) return collapsed;

  const cut = collapsed.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—–-]+$/u, '')}…`;
}

/**
 * The locale whose page is the primary one for a song.
 *
 * Three URLs exist for every song because the interface is translated three
 * ways, but only one of them is the page the reader of this translation wants:
 * a German song rendered into Turkish belongs to the Turkish page. `null` means
 * the app speaks no such language yet — pt-BR has readers and no interface —
 * and the caller falls back to the default locale rather than pretending.
 */
export function primaryLocaleFor(target: TargetLanguage): UiLocale | null {
  return (UI_LOCALES as readonly string[]).includes(target)
    ? (target as UiLocale)
    : null;
}

/** The locale a search engine should be pointed at when it has no preference. */
export function defaultLocaleFor(target: TargetLanguage): UiLocale {
  return primaryLocaleFor(target) ?? DEFAULT_LOCALE;
}

/** Every combination the table has to cover, for tests and for exhaustiveness. */
export const PHRASE_COMBINATIONS: readonly (readonly [
  UiLocale,
  TargetLanguage,
])[] = UI_LOCALES.flatMap((locale) =>
  TARGET_LANGUAGES.map((target) => [locale, target] as const),
);
