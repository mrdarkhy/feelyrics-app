import { domainError, err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { isReasonTag } from './reason-tag';
import type { ReasonTag } from './reason-tag';
import type { Line, Section } from './song';

/**
 * A song's body, as the maintainer submits it.
 *
 * The rules here are what stops a half-finished pass reaching readers. A body is
 * saved whole or not at all: there is no "partly translated" state in the store,
 * because the site has no honest way to render one — a line with no rendering is
 * a blank where a translation should be, and a rendering silently copied from
 * the original is worse, since it claims a decision nobody made.
 *
 * Work in progress belongs in the editor's draft, not in the database.
 */

export const MAX_BODY_SECTIONS = 60;
export const MAX_BODY_LINES = 400;
export const MAX_BODY_LINE_LENGTH = 500;
export const MAX_SECTION_LABEL_LENGTH = 80;
export const MAX_NOTE_LENGTH = 800;

export interface DraftLine {
  readonly original: string;
  readonly rendering: string;
  readonly note?: string | null;
  readonly tags?: readonly string[];
}

export interface DraftSection {
  readonly label: string;
  readonly lines: readonly DraftLine[];
}

export interface ValidatedLine {
  readonly position: number;
  readonly original: string;
  readonly rendering: string;
  readonly note: string | null;
  readonly tags: readonly ReasonTag[];
}

export interface ValidatedSection {
  readonly position: number;
  readonly label: string;
  readonly lines: readonly ValidatedLine[];
}

export interface ValidatedBody {
  readonly sections: readonly ValidatedSection[];
  readonly lineCount: number;
}

/**
 * Validates and renumbers a submitted body.
 *
 * Positions are assigned here rather than trusted from the caller: they are the
 * reading order, and a client that reorders its own array should not be able to
 * put the chorus before the first verse by sending stale indices.
 */
export function validateSongBody(
  sections: readonly DraftSection[],
): Result<ValidatedBody> {
  if (sections.length === 0) {
    return err(domainError('invalid_input', 'a body needs at least one section', 'sections'));
  }

  if (sections.length > MAX_BODY_SECTIONS) {
    return err(
      domainError(
        'invalid_input',
        `a body may hold at most ${MAX_BODY_SECTIONS} sections`,
        'sections',
      ),
    );
  }

  const validated: ValidatedSection[] = [];
  let lineCount = 0;

  for (const [sectionIndex, section] of sections.entries()) {
    const label = section.label.trim();
    if (label.length === 0) {
      return err(
        domainError('invalid_input', 'every section needs a label', `sections.${sectionIndex}.label`),
      );
    }

    const lines: ValidatedLine[] = [];

    for (const [lineIndex, line] of section.lines.entries()) {
      const original = line.original.trim();
      const rendering = line.rendering.trim();
      const field = `sections.${sectionIndex}.lines.${lineIndex}`;

      // A blank row is the editor's own scaffolding, not a lyric. Dropping it is
      // kinder than refusing the whole save over an empty line nobody typed in.
      if (original.length === 0 && rendering.length === 0) continue;

      if (original.length === 0) {
        return err(domainError('invalid_input', 'a line needs its original', `${field}.original`));
      }

      if (rendering.length === 0) {
        return err(
          domainError('invalid_input', 'every line needs a rendering', `${field}.rendering`),
        );
      }

      if (original.length > MAX_BODY_LINE_LENGTH || rendering.length > MAX_BODY_LINE_LENGTH) {
        return err(
          domainError(
            'invalid_input',
            `a line may be at most ${MAX_BODY_LINE_LENGTH} characters`,
            field,
          ),
        );
      }

      const note = (line.note ?? '').trim();
      if (note.length > MAX_NOTE_LENGTH) {
        return err(
          domainError(
            'invalid_input',
            `a note may be at most ${MAX_NOTE_LENGTH} characters`,
            `${field}.note`,
          ),
        );
      }

      const tags: ReasonTag[] = [];
      for (const tag of line.tags ?? []) {
        if (!isReasonTag(tag)) {
          return err(domainError('invalid_input', `unknown reason tag: ${tag}`, `${field}.tags`));
        }
        if (!tags.includes(tag)) tags.push(tag);
      }

      // A reason tag without a note is a label with no argument behind it. The
      // tag says "this line was a prosody call"; the note is the call.
      if (tags.length > 0 && note.length === 0) {
        return err(
          domainError(
            'missing_reason_tag',
            'a tagged line needs the note that explains the tag',
            `${field}.note`,
          ),
        );
      }

      lines.push({
        position: lines.length,
        original,
        rendering,
        note: note.length > 0 ? note : null,
        tags,
      });
    }

    // Sections emptied by the blank-row rule disappear rather than becoming
    // headings with nothing under them.
    if (lines.length === 0) continue;

    lineCount += lines.length;
    if (lineCount > MAX_BODY_LINES) {
      return err(
        domainError(
          'invalid_input',
          `a body may hold at most ${MAX_BODY_LINES} lines`,
          'sections',
        ),
      );
    }

    validated.push({
      position: validated.length,
      label: label.slice(0, MAX_SECTION_LABEL_LENGTH),
      lines,
    });
  }

  if (validated.length === 0) {
    return err(domainError('empty_lyrics', 'no lines survived validation', 'sections'));
  }

  return ok({ sections: validated, lineCount });
}

/**
 * The comparison key for "is this the same lyric line".
 *
 * Case, surrounding punctuation and repeated spaces all vary between one paste
 * of a song and the next; none of them changes which line it is.
 */
export function lineKey(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Carries a song's existing work onto a freshly pasted body.
 *
 * Songs in the catalogue already hold a couple of core lines with renderings,
 * notes and reason tags — the part that took the longest. When the full lyric is
 * pasted later, those lines reappear among hundreds, and retyping their
 * renderings from memory would quietly lose the reasoning. Matching them back is
 * the difference between pasting a song and starting it again.
 *
 * Only lines the draft leaves blank are filled: what the maintainer has already
 * typed in this session always wins.
 */
export function carryOverRenderings(
  draft: readonly DraftSection[],
  existing: readonly Section[],
): { sections: DraftSection[]; carried: number } {
  const known = new Map<string, Line>();
  for (const section of existing) {
    for (const line of section.lines) {
      const key = lineKey(line.original);
      if (key.length > 0 && !known.has(key)) known.set(key, line);
    }
  }

  let carried = 0;

  const sections = draft.map((section) => ({
    ...section,
    lines: section.lines.map((line) => {
      if (line.rendering.trim().length > 0) return line;

      const match = known.get(lineKey(line.original));
      if (!match) return line;

      carried += 1;
      return {
        ...line,
        rendering: match.rendering,
        note: line.note ?? match.note,
        tags: line.tags && line.tags.length > 0 ? line.tags : match.tags,
      };
    }),
  }));

  return { sections, carried };
}
