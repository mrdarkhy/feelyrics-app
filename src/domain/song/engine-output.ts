import { domainError, err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import type { TargetLanguage } from '../shared/language';
import type { ExtractionResult } from '../lyrics/extract';
import { normaliseTags } from './reason-tag';
import type { DraftSection } from './body';
import { MAX_NOTE_LENGTH, MAX_BODY_LINE_LENGTH } from './body';

/**
 * What the transcreation engine is asked for, and what it is allowed to give back.
 *
 * The engine never sees a free-form request. It is handed the lyric already cut
 * into numbered lines by the extractor, and it answers per index: a rendering,
 * an optional note, optional reason tags. The originals are ours, attached here
 * from the extraction rather than trusted from the model — so the one thing an
 * engine cannot do is quietly change the words it was asked to translate.
 *
 * This module is pure. Talking to a model is the infrastructure's job; deciding
 * whether the answer is a song body is the domain's.
 */

export interface EngineLineInput {
  /** Index into the flat line list — the engine's only handle on a line. */
  readonly i: number;
  readonly text: string;
  readonly adLib: boolean;
}

export interface EngineSectionInput {
  readonly label: string | null;
  readonly repeats: number;
  readonly lines: readonly EngineLineInput[];
}

export interface EngineBrief {
  readonly title: string;
  readonly artist: string;
  readonly source: string;
  readonly target: TargetLanguage;
  /** The asker's one line on why this song, when they left one. */
  readonly requesterNote: string | null;
  readonly sections: readonly EngineSectionInput[];
  readonly lineCount: number;
}

/** Numbers the extracted lines so the engine can answer by index. */
export function buildEngineBrief(
  extraction: ExtractionResult,
  meta: Pick<EngineBrief, 'title' | 'artist' | 'source' | 'target' | 'requesterNote'>,
): EngineBrief {
  let i = 0;
  const sections = extraction.sections.map((section) => ({
    label: section.label,
    repeats: section.repeats,
    lines: section.lines.map((line) => ({ i: i++, text: line.text, adLib: line.isAdLib })),
  }));
  return { ...meta, sections, lineCount: i };
}

/** The answer shape the engine is asked to produce. */
export interface EngineAnswer {
  readonly feel?: string;
  readonly sections?: readonly {
    readonly label?: string;
    readonly lines?: readonly {
      readonly i?: number;
      readonly t?: string;
      readonly n?: string;
      readonly g?: readonly string[];
    }[];
  }[];
}

/** Fallback section labels, in the target language, for unlabelled blocks. */
const SECTION_FALLBACK: Record<TargetLanguage, string> = {
  tr: 'Bölüm',
  en: 'Part',
  es: 'Parte',
  'pt-br': 'Parte',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pulls the first JSON object out of a model reply.
 *
 * Models fence their JSON, prefix it with a sentence, or both. Anything before
 * the first `{` and after the last `}` is dropped before parsing.
 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) return null;

  // Walk the braces so the object ends where it really ends, not at the last
  // "}" of a stray remark after the JSON. Strings are skipped, escapes honoured.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }

  // Unbalanced or unparsable: last resort, the widest slice.
  const end = text.lastIndexOf('}');
  if (end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface SectionsAnswer extends Record<string, unknown> {
  readonly sections: readonly unknown[];
}

/**
 * Finds the `{feel, sections}` object wherever the model put it.
 *
 * Models wrap ("{"result": {...}}"), answer with a bare `lines` array, or hand
 * back the object inside a one-element array. Each of those is the same
 * answer wearing a different coat; only a payload with no line list at all is
 * refused.
 */
export function unwrapAnswer(value: unknown, depth = 0): SectionsAnswer | null {
  if (depth > 3) return null;

  if (Array.isArray(value)) {
    // A bare list of sections, or a list of lines.
    if (value.length > 0 && value.every((item) => isRecord(item) && typeof item.i === 'number')) {
      return { sections: [{ lines: value }] };
    }
    if (value.length > 0 && value.every((item) => isRecord(item) && Array.isArray(item.lines))) {
      return { sections: value };
    }
    for (const item of value) {
      const found = unwrapAnswer(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;
  if (Array.isArray(value.sections)) return value as SectionsAnswer;
  if (Array.isArray(value.lines)) {
    return { feel: value.feel, sections: [{ label: value.label, lines: value.lines }] };
  }

  for (const key of Object.keys(value)) {
    const found = unwrapAnswer(value[key], depth + 1);
    if (found) {
      // Keep a feel profile written one level up, next to the wrapper.
      return found.feel === undefined && typeof value.feel === 'string'
        ? { ...found, feel: value.feel }
        : found;
    }
  }
  return null;
}

/** A one-line description of a value for a log entry: type and top-level keys. */
export function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (isRecord(value)) return `object{${Object.keys(value).slice(0, 12).join(',')}}`;
  return typeof value;
}

export interface EngineDraft {
  readonly feelProfile: string | null;
  readonly sections: readonly DraftSection[];
  /** Lines the engine left without a note — reported, never invented. */
  readonly unannotated: number;
}

/**
 * Re-attaches the originals and checks the engine covered every line.
 *
 * A missing rendering is a failure of the whole call, not a blank to paper over:
 * the body validator refuses half-translated songs for the same reason, and an
 * engine that skipped a line is an engine that should be asked again.
 */
export function assembleEngineDraft(
  brief: EngineBrief,
  rawAnswer: unknown,
): Result<EngineDraft> {
  const answer = unwrapAnswer(rawAnswer);
  if (!answer) {
    const shape = describeShape(rawAnswer);
    return err(domainError('engine_failed', `answer is not an object with sections (${shape})`));
  }

  const originals = new Map<number, EngineLineInput>();
  for (const section of brief.sections) {
    for (const line of section.lines) originals.set(line.i, line);
  }

  const rendered = new Map<number, { t: string; n: string | null; g: readonly string[] }>();
  const labels: string[] = [];

  for (const rawSection of answer.sections) {
    if (!isRecord(rawSection)) continue;
    labels.push(typeof rawSection.label === 'string' ? rawSection.label.trim() : '');
    if (!Array.isArray(rawSection.lines)) continue;

    for (const rawLine of rawSection.lines) {
      if (!isRecord(rawLine) || typeof rawLine.i !== 'number') continue;
      if (typeof rawLine.t !== 'string') continue;
      const t = rawLine.t.trim().slice(0, MAX_BODY_LINE_LENGTH);
      if (t.length === 0) continue;
      const note =
        typeof rawLine.n === 'string' ? rawLine.n.trim().slice(0, MAX_NOTE_LENGTH) : '';
      const tags = Array.isArray(rawLine.g) ? normaliseTags(rawLine.g) : [];
      rendered.set(rawLine.i, {
        t,
        n: note.length > 0 ? note : null,
        // A tag with no note is refused by the body validator; drop the tags
        // rather than the line.
        g: note.length > 0 ? tags : [],
      });
    }
  }

  const missing: number[] = [];
  for (const i of originals.keys()) if (!rendered.has(i)) missing.push(i);
  if (missing.length > 0) {
    return err(
      domainError(
        'engine_failed',
        `engine left ${missing.length} of ${originals.size} lines untranslated (first: ${missing[0]})`,
      ),
    );
  }

  let unannotated = 0;
  const fallback = SECTION_FALLBACK[brief.target];

  const sections: DraftSection[] = brief.sections.map((section, index) => {
    const engineLabel = labels[index] ?? '';
    const label =
      engineLabel.length > 0
        ? engineLabel
        : section.label && section.label.length > 0
          ? section.label
          : `${fallback} ${index + 1}`;

    return {
      label,
      lines: section.lines.map((line) => {
        const out = rendered.get(line.i);
        if (!out) throw new Error('unreachable: missing line survived the check');
        if (!out.n) unannotated += 1;
        return { original: line.text, rendering: out.t, note: out.n, tags: out.g };
      }),
    };
  });

  const feel =
    typeof answer.feel === 'string' && answer.feel.trim().length > 0
      ? answer.feel.trim().slice(0, 300)
      : null;

  return ok({ feelProfile: feel, sections, unannotated });
}
