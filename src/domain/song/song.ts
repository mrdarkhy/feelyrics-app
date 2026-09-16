import type { LanguagePair } from '../shared/language';
import type { ReasonTag } from './reason-tag';

/**
 * How the lyrics of a song reached us, and therefore what we are allowed to do
 * with them.
 *
 * This is not metadata. It is the field the whole publishing policy hangs on, so
 * it is required on every song and has no default — a song whose provenance
 * nobody recorded is a song nobody can safely publish.
 */
export type LyricsProvenance =
  /** A person pasted the lyrics in. Quotable only in the minimal excerpt. */
  | 'user-paste'
  /** Out of copyright (e.g. Martí's Guantanamera, 1891). Publishable in full. */
  | 'public-domain'
  /** Covered by an explicit licence we hold. Publishable in full. */
  | 'licensed';

export function allowsFullPublication(provenance: LyricsProvenance): boolean {
  return provenance === 'public-domain' || provenance === 'licensed';
}

/** A single lyric line and the decision behind its rendering. */
export interface Line {
  readonly id: string;
  readonly position: number;
  /** The line as sung, in the source language. */
  readonly original: string;
  /** The feel-translation — what the project calls the "oturtma". */
  readonly rendering: string;
  /**
   * Why this rendering, written in the **target** language: the reader of a
   * TR→ES song is a Spanish speaker, so the note is in Spanish.
   */
  readonly note: string | null;
  readonly tags: readonly ReasonTag[];
}

/** A verse, chorus or bridge. The label is in the target language. */
export interface Section {
  readonly id: string;
  readonly position: number;
  readonly label: string;
  readonly lines: readonly Line[];
}

export interface Song {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  readonly pair: LanguagePair;
  /** Which version of the transcreation engine produced the draft. */
  readonly engineVersion: string;
  /** One line naming the emotion the song runs on, in the target language. */
  readonly feelProfile: string | null;
  readonly provenance: LyricsProvenance;
  readonly sections: readonly Section[];
  /** Credit shown when the song exists because somebody asked for it. */
  readonly requestedBy: string | null;
  /** Whether a native speaker of the target language has signed off. */
  readonly validatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * A song narrowed to what a public page may show. The distinct type is the
 * point: a function that accepts a `PublicSong` cannot be handed a full one by
 * accident, so "we only ever render the excerpt in public" is checked by the
 * compiler rather than remembered by the author.
 */
export interface PublicSong extends Song {
  readonly __brand: 'PublicSong';
  /** True when lines were withheld, so the UI can say so honestly. */
  readonly truncated: boolean;
  /** How many lines the full version has. */
  readonly totalLineCount: number;
}

export function countLines(song: Pick<Song, 'sections'>): number {
  return song.sections.reduce((total, section) => total + section.lines.length, 0);
}

/** True when the song carries a whole body rather than a couple of core lines. */
export function isFullLength(song: Pick<Song, 'sections'>): boolean {
  return countLines(song) > 4;
}

/**
 * The first line that carries a note, which is the line worth putting on a
 * shareable card: a line without a note is just a lyric, and a lyric on its own
 * is the thing we are careful about republishing.
 */
export function highlightLine(song: Pick<Song, 'sections'>): Line | null {
  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.note && line.note.trim().length > 0) return line;
    }
  }
  return song.sections[0]?.lines[0] ?? null;
}
