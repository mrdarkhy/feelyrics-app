import 'server-only';
import type { TranscreationEngine } from '@/application/ports/engine';
import type { EngineBrief } from '@/domain/song/engine-output';
import { REASON_TAGS } from '@/domain/song/reason-tag';

/**
 * The engine, backed by the Claude Messages API.
 *
 * Plain `fetch` rather than an SDK: one endpoint, one request shape, and one
 * dependency fewer to keep in step with Vercel's build. The prompt encodes the
 * Feelyrics method as it stands after five hard-song tests — feel over meaning
 * over words, literal-first, sung-order, the reason-tag taxonomy — and asks for
 * an answer keyed by line index so the originals never leave our hands.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
/** Method version + model: what a suggestion on this song is measured against. */
export const ENGINE_METHOD_VERSION = '0.2.0';

const TARGET_NAMES: Record<string, string> = {
  tr: 'Turkish',
  en: 'English',
  es: 'Spanish',
  'pt-br': 'Brazilian Portuguese',
};

const SOURCE_NAMES: Record<string, string> = {
  ...TARGET_NAMES,
  it: 'Italian',
  fr: 'French',
  de: 'German',
  nap: 'Neapolitan',
};

function systemPrompt(target: string): string {
  const targetName = TARGET_NAMES[target] ?? target;
  return `You are the Feelyrics transcreation engine. You translate song lyrics into the closest possible FEELING in ${targetName}, not word for word — the way a bilingual fan explains to a friend what a line really does.

Order of priority: feel > meaning > words. Register (who is speaking, how rough or tender), metaphor, and how the line sits on the melody all outrank dictionary accuracy.

Method, applied to every line:
1. LITERAL-FIRST: first produce the plain literal reading. If it already carries the feeling, keep it — literal often wins (tag "literal-wins").
2. SUNG-ORDER: the line follows the vocal flow. Whatever word the singer hits first, your line opens with its counterpart when the language allows.
3. Keep names, ad-libs and sound effects as sung (tag "onomatopoeia"); keep loanwords the target culture already uses.
4. When both languages happen to share an idiom, use it (tag "idiom-twin"). Watch for look-alike words that mean something else (tag "false-friend").
5. Never explain a line by making it longer; a rendering is a line someone could sing or say, not a paragraph.
6. Do not censor. Slang stays slang, profanity stays profanity at the same intensity.

Notes: write a short note ONLY where a real decision was made — what the literal reading would have lost, and why this rendering keeps the feeling. Notes, section labels and the feel profile are written in ${targetName}, because the reader is a ${targetName} speaker. At least the three strongest lines of the song must carry a note; a chorus line is usually one of them. Give every noted line 1–3 reason tags from exactly this list: ${REASON_TAGS.join(', ')}.

Feel profile: one short line in ${targetName} naming the emotion the whole song runs on (for example an elegy in a major key; reckless abandon; grief with the brakes cut).

Output: a single JSON object and nothing else, no prose, no code fence:
{"feel":"...","sections":[{"label":"...","lines":[{"i":0,"t":"rendering","n":"note or omit","g":["tag"]}]}]}
Rules for the JSON: one entry per input line index, every index present exactly once, in order; "t" is the rendering; omit "n" and "g" on lines without a note; section labels in ${targetName} (e.g. verse, chorus, bridge in that language). Do NOT repeat the original text anywhere in your answer.`;
}

function userPrompt(brief: EngineBrief): string {
  const sourceName = SOURCE_NAMES[brief.source] ?? brief.source;
  const targetName = TARGET_NAMES[brief.target] ?? brief.target;
  const header = [
    `Song: ${brief.title}`,
    `Artist: ${brief.artist}`,
    `From ${sourceName} into ${targetName}.`,
    brief.requesterNote ? `Why the asker chose it: "${brief.requesterNote}"` : null,
    `${brief.lineCount} lines follow, numbered. Answer with the JSON object only.`,
  ]
    .filter(Boolean)
    .join('\n');

  const body = brief.sections
    .map((section, index) => {
      const title = section.label ? `[${section.label}]` : `[section ${index + 1}]`;
      const repeat = section.repeats > 1 ? ` (sung ${section.repeats} times)` : '';
      const lines = section.lines
        .map((line) => `${line.i}\t${line.adLib ? '(ad-lib) ' : ''}${line.text}`)
        .join('\n');
      return `${title}${repeat}\n${lines}`;
    })
    .join('\n\n');

  return `${header}\n\n${body}`;
}

export class AnthropicEngine implements TranscreationEngine {
  readonly version: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {
    this.version = `${ENGINE_METHOD_VERSION}/${model}`;
  }

  async draft(brief: EngineBrief): Promise<string> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 12_000,
        // No sampling parameters: current models reject `temperature` outright.
        system: systemPrompt(brief.target),
        messages: [{ role: 'user', content: userPrompt(brief) }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`engine responded ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };

    return (payload.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n');
  }
}

/**
 * A stand-in for local development without an API key: echoes each line back
 * with a marker and a note on the first line of every section, so the whole
 * "Translate now" path can be exercised end to end. Never active in production.
 */
class FakeEngine implements TranscreationEngine {
  readonly version = `${ENGINE_METHOD_VERSION}/fake`;

  async draft(brief: EngineBrief): Promise<string> {
    return JSON.stringify({
      feel: `[fake] ${brief.title}`,
      sections: brief.sections.map((section, index) => ({
        label: section.label ?? `Part ${index + 1}`,
        lines: section.lines.map((line, position) => ({
          i: line.i,
          t: `[${brief.target}] ${line.text}`,
          ...(position === 0 ? { n: 'fake note', g: ['literal-wins'] } : {}),
        })),
      })),
    });
  }
}

/** Builds the engine from the environment, or nothing when no key is set. */
export function engineFromEnv(): TranscreationEngine | null {
  if (process.env.NODE_ENV !== 'production' && process.env.FEELYRICS_ENGINE_FAKE === '1') {
    return new FakeEngine();
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.FEELYRICS_ENGINE_MODEL?.trim() || DEFAULT_MODEL;
  return new AnthropicEngine(key, model);
}
