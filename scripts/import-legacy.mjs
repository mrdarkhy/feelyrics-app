/**
 * Converts the legacy catalogue into the seed file.
 *
 * The old app kept every song in two places: `songs.js` on the public site
 * (two-line cores) and an inline `SONGS` array inside the studio player artifact
 * (full bodies). This script reads both, merges them by song, and writes one
 * typed seed module.
 *
 * Run once, by hand:
 *   node scripts/import-legacy.mjs <songs.js> <player.html> > src/infrastructure/db/seed-data.ts
 *
 * It is intentionally a plain .mjs script rather than part of the app: it exists
 * to be run at most a handful of times, and it should not be able to drift into
 * the runtime.
 */

import fs from 'node:fs';

const [, , songsPath, playerPath] = process.argv;

if (!songsPath) {
  console.error('usage: node scripts/import-legacy.mjs <songs.js> [player.html]');
  process.exit(1);
}

/** Legacy notes carry their reason tags inline, in the target language. */
const TAG_ALIASES = {
  his: 'feel',
  register: 'register',
  metafor: 'metaphor',
  prozodi: 'prosody',
  'kültürel-kod': 'cultural-code',
  'literal-tercih': 'literal-wins',
  'biçim-gömülü': 'form-embedded',
  'söyleniş-sırası': 'sung-order',
  onomatope: 'onomatopoeia',
  'deyim-ikizi': 'idiom-twin',
  'kalıp-ikizi': 'idiom-twin',
  'yanlış-dost': 'false-friend',
  'ses-oyunu': 'form-embedded',
  'kalıp-ikizi/biçim-gömülü': 'idiom-twin',
  'kelime-seçimi→his': 'feel',
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
  sentimiento: 'feel',
  registro: 'register',
  metáfora: 'metaphor',
  prosodia: 'prosody',
  'código-cultural': 'cultural-code',
  'literal-gana': 'literal-wins',
  'forma-incrustada': 'form-embedded',
};

function splitNote(note) {
  if (!note) return { text: null, tags: [] };
  const match = note.match(/\s*\[([^\]]+)\]\s*$/);
  if (!match) return { text: note.trim(), tags: [] };

  const tags = [
    ...new Set(
      match[1]
        .split(/[·,]/)
        .map((part) => TAG_ALIASES[part.trim().toLowerCase()])
        .filter(Boolean),
    ),
  ].slice(0, 4);

  return { text: note.slice(0, match.index).trim() || null, tags };
}

const TRANSLIT = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c',
  ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', ñ: 'n', Ñ: 'n', ß: 'ss',
};

function slugify(input) {
  return Array.from(input)
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');
}

function parsePair(raw) {
  const [source, target] = String(raw).split('→').map((p) => p.trim().toLowerCase());
  return { source, target };
}

/** Public-domain lyrics are the only ones publishable in full. */
function provenanceFor(song) {
  const id = String(song.id ?? '');
  if (id.startsWith('guantanamera')) return 'public-domain';
  return 'user-paste';
}

/**
 * The old catalogue disambiguated two translations of one song by suffixing the
 * title — "Şımarık (ES)", "Homem Amarelo (TR)" — because ids were flat. The slug
 * now carries the language pair, so the suffix is noise in both the title and
 * the URL.
 */
function cleanTitle(title) {
  return String(title)
    .replace(/\s*\((?:TR|EN|ES|PT-BR|IT|FR|DE)\)\s*$/i, '')
    .trim();
}

function normalise(song) {
  const { source, target } = parsePair(song.pair);
  const title = cleanTitle(song.title);

  const sections = (song.sections ?? []).map(([label, lines], index) => ({
    position: index,
    label: String(label ?? ''),
    lines: (lines ?? [])
      .filter((line) => Array.isArray(line) && typeof line[0] === 'string')
      .map(([original, rendering, note], lineIndex) => {
        const { text, tags } = splitNote(note);
        return {
          position: lineIndex,
          original: String(original),
          rendering: String(rendering ?? ''),
          note: text,
          tags,
        };
      }),
  }));

  return {
    slug: `${slugify(`${song.artist} ${title}`)}-${source}-${target}`,
    title,
    artist: String(song.artist),
    source,
    target,
    engineVersion: String(song.engine ?? '0.1.1'),
    feelProfile: song.feel ? String(song.feel) : null,
    provenance: provenanceFor(song),
    requestedBy: song.requestedBy ? String(song.requestedBy) : null,
    validatedBy: null,
    sections: sections.filter((section) => section.lines.length > 0),
  };
}

// ── read the public catalogue ────────────────────────────────────────────────
const songsSource = fs.readFileSync(songsPath, 'utf8');
const catalogue = [];
new Function('out', `${songsSource}\nout.push(...SONGS);`)(catalogue);

// ── read the studio player's full bodies, when given ─────────────────────────
const fullSongs = [];
if (playerPath) {
  const html = fs.readFileSync(playerPath, 'utf8');
  const start = html.indexOf('const SONGS = [];');
  const end = html.indexOf('// ── app ─');
  if (start >= 0 && end > start) {
    const body = html.slice(start + 'const SONGS = [];'.length, end);
    new Function('SONGS', body)(fullSongs);
  }
}

// Merge: a full body always beats a two-line core for the same song.
const bySlug = new Map();
for (const song of catalogue) bySlug.set(normalise(song).slug, normalise(song));
for (const song of fullSongs) {
  const normalised = normalise(song);
  const existing = bySlug.get(normalised.slug);
  const existingLines = existing
    ? existing.sections.reduce((n, s) => n + s.lines.length, 0)
    : 0;
  const incomingLines = normalised.sections.reduce((n, s) => n + s.lines.length, 0);
  if (!existing || incomingLines > existingLines) bySlug.set(normalised.slug, normalised);
}

const songs = [...bySlug.values()].sort((a, b) =>
  `${a.artist}${a.title}`.localeCompare(`${b.artist}${b.title}`),
);

const totalLines = songs.reduce(
  (n, s) => n + s.sections.reduce((m, sec) => m + sec.lines.length, 0),
  0,
);

process.stdout.write(`/**
 * Seed data, imported from the pre-database catalogue.
 *
 * Generated by scripts/import-legacy.mjs — ${songs.length} songs, ${totalLines} lines.
 * Edit songs through the app rather than here; this file is a starting point,
 * not a source of truth.
 */
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import type { LyricsProvenance } from '@/domain/song/song';
import type { ReasonTag } from '@/domain/song/reason-tag';

export interface SeedLine {
  position: number;
  original: string;
  rendering: string;
  note: string | null;
  tags: ReasonTag[];
}

export interface SeedSection {
  position: number;
  label: string;
  lines: SeedLine[];
}

export interface SeedSong {
  slug: string;
  title: string;
  artist: string;
  source: LanguageCode;
  target: TargetLanguage;
  engineVersion: string;
  feelProfile: string | null;
  provenance: LyricsProvenance;
  requestedBy: string | null;
  validatedBy: string | null;
  sections: SeedSection[];
}

export const SEED_SONGS: SeedSong[] = ${JSON.stringify(songs, null, 2)};
`);

console.error(`imported ${songs.length} songs / ${totalLines} lines`);
