import { lineKey } from './body';

/**
 * Is an engine draft good enough to be a Feelyrics page?
 *
 * "Translated every line" is the body validator's bar, and it is the wrong one
 * here. A public song page shows at most two lines and prefers the ones that
 * carry a note; the search description leans on the feel profile; the reason
 * tags are the asset a buyer is shown. A draft that renders forty lines and
 * explains none of them passes validation and still publishes a page with
 * nothing on it that a flat translation does not already have.
 *
 * So the draft is graded on what the surfaces actually need, and the grade has
 * three outcomes rather than two. Only one failure is worth refusing a song
 * over — an engine that handed the source back — because that is not a
 * translation. A draft that is merely thin still helps the person waiting for
 * it, so it publishes and is reported, not thrown away.
 *
 * This module is pure arithmetic over counts. Whoever counts the lines decides
 * what a line is; the bar lives here so it can be argued with in one place.
 */

/** Share of renderings that may come back identical to the source. */
export const MAX_ECHO_RATIO = 0.5;

/** Below this many translatable lines the echo ratio is noise, not evidence. */
export const MIN_LINES_FOR_ECHO_CHECK = 4;

/** Shortest note that can say anything; below it the chip is decoration. */
export const MIN_NOTE_LENGTH = 8;

/**
 * How much of its own a note must add when it quotes the whole line back.
 *
 * Set just above the length of the lead-ins a wrapper is made of ("Literally:",
 * "Düz çeviri:", "Word for word:"). A real note that quotes the line inside a
 * sentence clears it several times over; a note that is the line with a label
 * on the front does not.
 */
export const MIN_NOTE_SURPLUS = 16;

/** Most noted lines ever asked for — past this the notes stop being choices. */
export const MAX_REQUIRED_NOTES = 8;

/** Fewest noted lines worth publishing as a feel translation. */
export const MIN_REQUIRED_NOTES = 3;

/** Roughly one line in seven carries a decision worth writing down. */
const NOTE_SHARE = 0.15;

/**
 * How many noted lines this song owes its readers.
 *
 * Scaled, not flat: three notes on a four-line fragment is every line, and three
 * notes on a ninety-line rap is a rounding error. Short songs are never asked
 * for more notes than they have lines.
 */
export function requiredNotes(lineCount: number): number {
  if (lineCount <= 0) return 0;
  const scaled = Math.ceil(lineCount * NOTE_SHARE);
  const bounded = Math.min(MAX_REQUIRED_NOTES, Math.max(MIN_REQUIRED_NOTES, scaled));
  return Math.min(lineCount, bounded);
}

/**
 * Does this note add anything the reader cannot already see?
 *
 * A note is the one place the method is visible: what the literal reading would
 * have lost, and why this line keeps it. A model under a "write a note" rule
 * will sometimes satisfy it by echoing the line back — "Literally: I am waking
 * up" under the rendering "I am waking up". Kept, that becomes a note chip on
 * the public page and a row in the dataset that teaches nothing.
 *
 * Judged conservatively: only restatement is caught, never a short-but-real
 * note. Comparison runs through the same normalisation the catalogue uses to
 * decide whether two pasted lines are the same line.
 */
export function isRestatedNote(
  note: string,
  rendering: string,
  original: string,
): boolean {
  const noteKey = lineKey(note);
  if (noteKey.length < MIN_NOTE_LENGTH) return true;

  for (const side of [rendering, original]) {
    const sideKey = lineKey(side);
    if (sideKey.length === 0) continue;
    if (noteKey === sideKey) return true;
    // "Literally: <the line>" — a wrapper with almost nothing of its own.
    if (noteKey.includes(sideKey) && noteKey.length - sideKey.length < MIN_NOTE_SURPLUS) {
      return true;
    }
  }

  return false;
}

/** What the assembler counted while re-attaching the originals. */
export interface DraftFacts {
  /** Lines the engine was asked to render. */
  readonly lineCount: number;
  /** Lines that are not ad-libs — the ones an echo would be suspicious on. */
  readonly translatableLines: number;
  /** Renderings identical to their own source line, ad-libs excluded. */
  readonly echoedLines: number;
  /** Lines that came back with a note worth keeping. */
  readonly notedLines: number;
  /** Noted lines that also carry at least one reason tag. */
  readonly taggedLines: number;
  readonly hasFeelProfile: boolean;
}

export type DraftVerdict = 'publishable' | 'thin' | 'rejected';

export type DraftFlaw =
  | 'echoed-source'
  | 'too-few-notes'
  | 'untagged-notes'
  | 'no-feel-profile';

export interface DraftGrade {
  readonly verdict: DraftVerdict;
  readonly flaws: readonly DraftFlaw[];
  readonly requiredNotes: number;
  readonly notedLines: number;
  /** Share of translatable lines handed back unchanged, 0 when there are none. */
  readonly echoRatio: number;
  /** One line for a log or an admin row. */
  readonly summary: string;
}

/**
 * Grades an assembled draft.
 *
 * `rejected` is reserved for the one failure that makes the page a lie. Every
 * other shortfall reads as `thin`: the translation stands, the page is poorer
 * than it should be, and somebody should come back to it.
 */
export function gradeDraft(facts: DraftFacts): DraftGrade {
  const required = requiredNotes(facts.lineCount);
  const echoRatio =
    facts.translatableLines > 0 ? facts.echoedLines / facts.translatableLines : 0;

  const flaws: DraftFlaw[] = [];

  const echoed =
    facts.translatableLines >= MIN_LINES_FOR_ECHO_CHECK && echoRatio > MAX_ECHO_RATIO;
  if (echoed) flaws.push('echoed-source');
  if (facts.notedLines < required) flaws.push('too-few-notes');
  if (facts.taggedLines < facts.notedLines) flaws.push('untagged-notes');
  if (!facts.hasFeelProfile) flaws.push('no-feel-profile');

  const verdict: DraftVerdict = echoed ? 'rejected' : flaws.length > 0 ? 'thin' : 'publishable';

  const summary = [
    `${facts.notedLines}/${required} noted`,
    `${facts.taggedLines} tagged`,
    `echo ${Math.round(echoRatio * 100)}%`,
    facts.hasFeelProfile ? 'feel ok' : 'no feel',
  ].join(' · ');

  return { verdict, flaws, requiredNotes: required, notedLines: facts.notedLines, echoRatio, summary };
}

/** Why a rejected draft was refused, in words a log line can carry. */
export function explainFlaws(grade: DraftGrade): string {
  if (grade.flaws.length === 0) return 'none';
  return grade.flaws.join(', ');
}
