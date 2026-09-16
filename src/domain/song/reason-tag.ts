/**
 * Reason tags — why a line was rendered the way it was.
 *
 * This taxonomy is the product's actual asset. A translation on its own is a
 * guess; a translation plus the reason it beat the literal candidate is
 * annotated data. Every human correction must carry at least one tag, which is
 * what turns a correction into a preference pair rather than an opinion.
 *
 * Tags are stored as stable machine codes. Their human labels live in the
 * message catalogues, so a Turkish reader sees "prozodi" and a Spanish reader
 * sees "prosodia" for the very same tag.
 */

export const REASON_TAGS = [
  /** The line carries an emotion the literal wording would not. */
  'feel',
  /** Formality, slang, dialect — who is speaking and how. */
  'register',
  /** An image was swapped for one that lands in the target culture. */
  'metaphor',
  /** Syllables, stress, breath — how the line sits on the melody. */
  'prosody',
  /** A reference only insiders of the source culture decode. */
  'cultural-code',
  /** The word-for-word candidate was the strongest option and won. */
  'literal-wins',
  /** Meaning lives in the grammar or sound itself, not in the words. */
  'form-embedded',
  /** Word order follows the vocal line: the song's first word opens the line. */
  'sung-order',
  /** A sound effect or ad-lib is carried as sung, not translated. */
  'onomatopoeia',
  /** Both languages happen to have the same idiom. */
  'idiom-twin',
  /** A look-alike word means something else; the trap was avoided. */
  'false-friend',
] as const;

export type ReasonTag = (typeof REASON_TAGS)[number];

export function isReasonTag(value: unknown): value is ReasonTag {
  return (
    typeof value === 'string' && (REASON_TAGS as readonly string[]).includes(value)
  );
}

/**
 * Tags offered in the public "how would you land this line?" flow.
 *
 * Deliberately the original seven. The later four (`sung-order`, `onomatopoeia`,
 * `idiom-twin`, `false-friend`) were discovered by working on songs and are
 * meaningful to the maintainers, but asking a first-time contributor to pick
 * between "form-embedded" and "idiom-twin" is a way to lose the contribution.
 */
export const PUBLIC_REASON_TAGS: readonly ReasonTag[] = [
  'feel',
  'register',
  'metaphor',
  'prosody',
  'cultural-code',
  'literal-wins',
  'form-embedded',
];

export const MAX_TAGS_PER_LINE = 4;

/**
 * Normalises a tag list coming from outside: drops unknown codes, removes
 * duplicates, and caps the length. A line tagged with everything says nothing.
 */
export function normaliseTags(input: readonly unknown[]): ReasonTag[] {
  const seen = new Set<ReasonTag>();
  for (const candidate of input) {
    if (isReasonTag(candidate)) seen.add(candidate);
    if (seen.size >= MAX_TAGS_PER_LINE) break;
  }
  return [...seen];
}

/**
 * Legacy notes carry their tags inline, in the target language, inside trailing
 * brackets: `... [prozodi · his]`. The catalogue built before this app existed is
 * full of them, so the importer needs to read that form.
 */
const LEGACY_TAG_ALIASES: Record<string, ReasonTag> = {
  // Turkish
  his: 'feel',
  register: 'register',
  metafor: 'metaphor',
  prozodi: 'prosody',
  'kültürel-kod': 'cultural-code',
  'kulturel-kod': 'cultural-code',
  'literal-tercih': 'literal-wins',
  'biçim-gömülü': 'form-embedded',
  'bicim-gomulu': 'form-embedded',
  'söyleniş-sırası': 'sung-order',
  'soylenis-sirasi': 'sung-order',
  onomatope: 'onomatopoeia',
  'deyim-ikizi': 'idiom-twin',
  'kalıp-ikizi': 'idiom-twin',
  'kalip-ikizi': 'idiom-twin',
  'yanlış-dost': 'false-friend',
  'ses-oyunu': 'form-embedded',
  'kelime-seçimi→his': 'feel',
  // English
  feel: 'feel',
  metaphor: 'metaphor',
  prosody: 'prosody',
  'cultural-code': 'cultural-code',
  'literal-wins': 'literal-wins',
  'form-embedded': 'form-embedded',
  'sung-order': 'sung-order',
  onomatopoeia: 'onomatopoeia',
  'idiom-twin': 'idiom-twin',
  'false-friend': 'false-friend',
  // Spanish
  sentimiento: 'feel',
  registro: 'register',
  metáfora: 'metaphor',
  metafora: 'metaphor',
  prosodia: 'prosody',
  'código-cultural': 'cultural-code',
  'codigo-cultural': 'cultural-code',
  'literal-gana': 'literal-wins',
  'forma-incrustada': 'form-embedded',
};

/**
 * Extracts the tag list from a legacy note and returns the note without it.
 * Returns the note unchanged and an empty tag list when there is no bracket.
 */
export function splitLegacyNote(note: string): {
  text: string;
  tags: ReasonTag[];
} {
  const match = note.match(/\s*\[([^\]]+)\]\s*$/);
  if (!match?.[1]) return { text: note.trim(), tags: [] };

  const tags = match[1]
    .split(/[·,]/)
    .map((part) => part.trim().toLowerCase())
    .map((part) => LEGACY_TAG_ALIASES[part])
    .filter((tag): tag is ReasonTag => tag !== undefined);

  return {
    text: note.slice(0, match.index).trim(),
    tags: normaliseTags(tags),
  };
}
