import { domainError, err, ok } from '../shared/result';
import type { Result } from '../shared/result';

/**
 * Turns a wall of pasted lyrics into sections and lines.
 *
 * This is the one piece of the pipeline that touches raw user input at volume,
 * and it is deliberately a pure function of a string: no network, no database,
 * no lyric provider. The app never goes looking for lyrics — somebody pastes
 * them, we give the text a shape, and the shape is what the translator works on.
 *
 * Text arriving from lyric sites carries a lot of debris (view counts, "Embed",
 * contributor banners, smart quotes), and text arriving from a phone keyboard
 * carries none of it but also no section markers. Both have to come out the
 * same way.
 */

export interface ExtractedLine {
  readonly text: string;
  /** Parenthetical backing vocals — sung, but not the lead line. */
  readonly isAdLib: boolean;
}

export interface ExtractedSection {
  readonly label: string | null;
  readonly lines: readonly ExtractedLine[];
  /** How many times this exact block repeats in the source text. */
  readonly repeats: number;
}

export interface ExtractionResult {
  readonly sections: readonly ExtractedSection[];
  readonly lineCount: number;
  /** Lines dropped as site furniture, surfaced so the paste can be audited. */
  readonly discardedLines: readonly string[];
  /** True when no explicit markers were found and blank lines did the grouping. */
  readonly inferredStructure: boolean;
}

export const MAX_LYRICS_LENGTH = 24_000;
const MAX_LINE_LENGTH = 500;
const MAX_SECTIONS = 60;

/**
 * Debris from lyric sites. Matched against the whole trimmed line, so a lyric
 * that merely contains the word "embed" survives.
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /^\d*\s*embed$/i,
  /^you might also like$/i,
  /^see .+ live$/i,
  /^get tickets as low as \$\d+/i,
  /^\d+\s+contributors?.*$/i,
  /^translations?$/i,
  /^[\d.,]+\s*(views|görüntüleme|visitas)$/i,
  /^advertisement$/i,
  /^lyrics$/i,
  /^\[?instrumental\]?$/i,
  /^share (url|link)$/i,
];

/**
 * Section markers in the five languages the catalogue actually contains, in the
 * three shapes people paste them: `[Chorus]`, `Chorus:` and `(Chorus)`.
 */
const SECTION_WORDS = [
  'intro',
  'verse',
  'pre-chorus',
  'prechorus',
  'chorus',
  'hook',
  'bridge',
  'outro',
  'refrain',
  'drop',
  'post-chorus',
  'interlude',
  'breakdown',
  'part',
  // Turkish
  'giriş',
  'giris',
  'nakarat',
  'köprü',
  'kopru',
  'kıta',
  'kita',
  'bölüm',
  'bolum',
  'final',
  // Spanish
  'estribillo',
  'verso',
  'puente',
  'coro',
  'introducción',
  'introduccion',
  // Portuguese
  'refrão',
  'refrao',
  'ponte',
  // Italian
  'ritornello',
  'strofa',
  'inciso',
  // German
  'strophe',
  'refrain-de',
] as const;

const SECTION_WORD_PATTERN = SECTION_WORDS.map((word) =>
  word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
).join('|');

const BRACKET_MARKER = /^\[([^\]]{1,80})\]$/;
const COLON_MARKER = new RegExp(
  `^((?:${SECTION_WORD_PATTERN})(?:\\s*[\\d IVX]+)?)\\s*:\\s*$`,
  'i',
);
const PAREN_MARKER = new RegExp(
  `^\\(((?:${SECTION_WORD_PATTERN})(?:\\s*[\\d IVX]+)?)\\)$`,
  'i',
);

function normaliseWhitespace(input: string): string {
  return (
    input
      .replace(/\r\n?/g, '\n')
      // Every Unicode space separator collapses to a plain space. `\p{Zs}`
      // covers non-breaking, thin, figure and narrow spaces in one go — all of
      // which arrive from web copy-paste and none of which should survive into
      // a line the translator has to match on.
      .replace(/\p{Zs}/gu, ' ')
      // Zero-width characters and the byte-order mark are invisible even to
      // the person pasting, and would otherwise make two identical choruses
      // fail to compare equal.
      // Alternation rather than a character class: zero-width joiners inside a
      // class can combine with neighbouring code points, which is both a lint
      // error and a real source of surprise.
      .replace(/\u200b|\u200c|\u200d|\ufeff/g, '')
      // Smart quotes, normalised so later matching is predictable. Written as
      // escapes so the source stays ASCII and reviewable.
      .replace(/[\u2018\u2019\u201b]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[ \t]+/g, ' ')
  );
}

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

/** Returns the section label if this line is a marker, else null. */
function readMarker(line: string): string | null {
  const bracket = line.match(BRACKET_MARKER);
  if (bracket?.[1]) return bracket[1].trim();

  const colon = line.match(COLON_MARKER);
  if (colon?.[1]) return colon[1].trim();

  const paren = line.match(PAREN_MARKER);
  if (paren?.[1]) return paren[1].trim();

  return null;
}

/**
 * A line that is entirely parenthesised is a backing vocal. Keeping that flag
 * matters downstream: ad-libs are performance, not text, and the house rule is
 * to carry them as sung rather than translate them.
 */
function isAdLib(line: string): boolean {
  return /^\(.*\)$/.test(line) && line.length > 2;
}

function fingerprint(lines: readonly ExtractedLine[]): string {
  return lines
    .map((line) => line.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .join('|');
}

export function extractLyrics(rawInput: string): Result<ExtractionResult> {
  if (typeof rawInput !== 'string') {
    return err(domainError('invalid_input', 'lyrics must be a string', 'lyrics'));
  }

  if (rawInput.length > MAX_LYRICS_LENGTH) {
    return err(
      domainError(
        'invalid_input',
        `lyrics exceed ${MAX_LYRICS_LENGTH} characters`,
        'lyrics',
      ),
    );
  }

  const normalised = normaliseWhitespace(rawInput);
  const rawLines = normalised.split('\n');

  const discardedLines: string[] = [];
  type Block = { label: string | null; lines: ExtractedLine[] };
  const blocks: Block[] = [];
  let current: Block = { label: null, lines: [] };
  let sawExplicitMarker = false;

  const pushCurrent = () => {
    if (current.lines.length > 0) blocks.push(current);
  };

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      // A blank line closes the block only when no marker is steering us.
      if (!sawExplicitMarker && current.lines.length > 0) {
        pushCurrent();
        current = { label: null, lines: [] };
      }
      continue;
    }

    if (isNoise(line)) {
      discardedLines.push(line);
      continue;
    }

    const marker = readMarker(line);
    if (marker !== null) {
      sawExplicitMarker = true;
      pushCurrent();
      current = { label: marker, lines: [] };
      continue;
    }

    current.lines.push({
      text: line.slice(0, MAX_LINE_LENGTH),
      isAdLib: isAdLib(line),
    });
  }
  pushCurrent();

  if (blocks.length === 0) {
    return err(domainError('empty_lyrics', 'no lyric lines found', 'lyrics'));
  }

  // Collapse identical blocks — a chorus pasted four times is one section that
  // repeats four times, and carrying it once keeps the translator honest about
  // it being the same lines.
  const merged: ExtractedSection[] = [];
  const indexByFingerprint = new Map<string, number>();

  for (const block of blocks.slice(0, MAX_SECTIONS)) {
    const key = fingerprint(block.lines);
    if (key.length === 0) continue;

    const existingIndex = indexByFingerprint.get(key);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      if (existing) {
        merged[existingIndex] = {
          ...existing,
          label: existing.label ?? block.label,
          repeats: existing.repeats + 1,
        };
      }
      continue;
    }

    indexByFingerprint.set(key, merged.length);
    merged.push({ label: block.label, lines: block.lines, repeats: 1 });
  }

  if (merged.length === 0) {
    return err(domainError('empty_lyrics', 'no lyric lines found', 'lyrics'));
  }

  return ok({
    sections: merged,
    lineCount: merged.reduce((total, section) => total + section.lines.length, 0),
    discardedLines,
    inferredStructure: !sawExplicitMarker,
  });
}
