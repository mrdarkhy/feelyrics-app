import { describe, expect, it } from 'vitest';
import en from '@messages/en.json';
import tr from '@messages/tr.json';
import es from '@messages/es.json';
import { UI_LOCALES } from '@/domain/shared/language';
import { REASON_TAGS } from '@/domain/song/reason-tag';
import { REQUEST_STATUSES } from '@/domain/request/song-request';

/**
 * Translation completeness, enforced rather than trusted.
 *
 * A missing key in one language does not fail a build, it just renders the key
 * name to a reader — and nobody on the team reads all three. These tests are the
 * only thing standing between "fully translated" and "mostly translated".
 */

type Messages = Record<string, unknown>;

function flatten(input: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else if (typeof value === 'object' && value !== null) {
      for (const [nested, nestedValue] of flatten(value as Messages, path)) {
        out.set(nested, nestedValue);
      }
    }
  }
  return out;
}

const catalogues: Record<string, Map<string, string>> = {
  en: flatten(en as Messages),
  tr: flatten(tr as Messages),
  es: flatten(es as Messages),
};

/** Placeholders like `{count}`, ignoring the plural bodies that follow. */
function placeholders(message: string): Set<string> {
  const found = new Set<string>();
  const pattern = /\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return found;
}

describe('message catalogues', () => {
  it('covers every locale the app routes to', () => {
    for (const locale of UI_LOCALES) {
      expect(Object.keys(catalogues)).toContain(locale);
    }
  });

  it.each(['tr', 'es'])('%s has every key English has', (locale) => {
    const source = catalogues.en!;
    const target = catalogues[locale]!;

    const missing = [...source.keys()].filter((key) => !target.has(key));
    expect(missing, `missing in ${locale}: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(['tr', 'es'])('%s has no keys English lacks', (locale) => {
    const source = catalogues.en!;
    const target = catalogues[locale]!;

    const extra = [...target.keys()].filter((key) => !source.has(key));
    expect(extra, `orphaned in ${locale}: ${extra.join(', ')}`).toEqual([]);
  });

  it.each(['tr', 'es'])('%s uses the same placeholders as English', (locale) => {
    const source = catalogues.en!;
    const target = catalogues[locale]!;

    const mismatches: string[] = [];
    for (const [key, message] of source) {
      const expected = placeholders(message);
      const actual = placeholders(target.get(key) ?? '');

      for (const name of expected) {
        // A translation that drops `{name}` renders a sentence with a hole in it.
        if (!actual.has(name)) mismatches.push(`${key}: missing {${name}}`);
      }
      for (const name of actual) {
        // One that invents a placeholder renders the braces literally.
        if (!expected.has(name)) mismatches.push(`${key}: unexpected {${name}}`);
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it.each(['en', 'tr', 'es'])('%s has no empty strings', (locale) => {
    const blanks = [...catalogues[locale]!.entries()]
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(blanks).toEqual([]);
  });

  it('labels every reason tag, in every language', () => {
    for (const locale of UI_LOCALES) {
      const catalogue = catalogues[locale]!;
      for (const tag of REASON_TAGS) {
        expect(catalogue.has(`tags.${tag}`), `${locale} missing tags.${tag}`).toBe(true);
        expect(
          catalogue.has(`tags.descriptions.${tag}`),
          `${locale} missing tags.descriptions.${tag}`,
        ).toBe(true);
      }
    }
  });

  it('labels every request status, in every language', () => {
    for (const locale of UI_LOCALES) {
      const catalogue = catalogues[locale]!;
      for (const status of REQUEST_STATUSES) {
        expect(catalogue.has(`requests.status.${status}`)).toBe(true);
        expect(catalogue.has(`requests.statusHint.${status}`)).toBe(true);
      }
    }
  });

  it('translates every domain error code', () => {
    const codes = [...catalogues.en!.keys()].filter((key) =>
      key.startsWith('errors.codes.'),
    );
    expect(codes.length).toBeGreaterThan(8);

    for (const locale of UI_LOCALES) {
      for (const code of codes) {
        expect(catalogues[locale]!.has(code), `${locale} missing ${code}`).toBe(true);
      }
    }
  });

  it('leaves no English text sitting in the other catalogues', () => {
    // A spot check on phrases that would only appear if a key had been copied
    // across without being translated.
    const suspicious = ['Loading…', 'Not found', 'Search songs or artists'];
    for (const locale of ['tr', 'es'] as const) {
      const values = [...catalogues[locale]!.values()];
      for (const phrase of suspicious) {
        expect(values, `${locale} still contains "${phrase}"`).not.toContain(phrase);
      }
    }
  });
});
