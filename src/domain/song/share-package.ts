import { domainError, err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { isTargetLanguage, isLanguageCode } from '../shared/language';
import type { LanguagePair } from '../shared/language';
import { normaliseTags } from './reason-tag';
import type { Line, Section, Song } from './song';

/**
 * The payload carried inside a share link's URL fragment.
 *
 * Why a fragment: everything after `#` is stripped by the browser before the
 * request goes out. It reaches no server, no access log, no CDN. A full song
 * therefore travels from the sender's device to the reader's without ever being
 * hosted by us — which is what lets a complete translation be shared at all
 * while the public pages stay at two lines.
 *
 * The shape is versioned (`v`) and its keys are short, because the whole thing
 * is deflated and base64url-encoded into a URL, and browsers cap URL length.
 * This module stays pure: turning the package into a string is the job of the
 * codec in the infrastructure layer.
 */

export const SHARE_PACKAGE_VERSION = 1;
export const SHARE_FRAGMENT_PREFIX = 'f1.';

/**
 * Conservative ceiling for the encoded payload. Chrome is the tightest mainstream
 * browser at roughly 32k characters of URL; staying well under it leaves room for
 * the origin, and for messaging apps that wrap links.
 */
export const MAX_ENCODED_SHARE_LENGTH = 24_000;

export interface SharePackageLine {
  /** original */
  readonly o: string;
  /** rendering */
  readonly t: string;
  /** note, omitted when absent */
  readonly n?: string;
  /** reason tags, omitted when empty */
  readonly g?: readonly string[];
}

export interface SharePackageSection {
  /** label */
  readonly k: string;
  /** lines */
  readonly l: readonly SharePackageLine[];
}

export interface SharePackage {
  readonly v: number;
  readonly title: string;
  readonly artist: string;
  /** source language code */
  readonly src: string;
  /** target language code */
  readonly tgt: string;
  readonly engine: string;
  /** feel profile, omitted when absent */
  readonly feel?: string;
  /** requested-by credit, omitted when absent */
  readonly by?: string;
  readonly sections: readonly SharePackageSection[];
}

export function toSharePackage(song: Song): SharePackage {
  return {
    v: SHARE_PACKAGE_VERSION,
    title: song.title,
    artist: song.artist,
    src: song.pair.source,
    tgt: song.pair.target,
    engine: song.engineVersion,
    ...(song.feelProfile ? { feel: song.feelProfile } : {}),
    ...(song.requestedBy ? { by: song.requestedBy } : {}),
    sections: song.sections.map((section) => ({
      k: section.label,
      l: section.lines.map((line) => ({
        o: line.original,
        t: line.rendering,
        ...(line.note ? { n: line.note } : {}),
        ...(line.tags.length > 0 ? { g: [...line.tags] } : {}),
      })),
    })),
  };
}

/**
 * A song reconstructed from a link. It is deliberately *not* persisted: the
 * reader's browser holds it for the session, and that is the whole point.
 */
export interface SharedSong {
  readonly title: string;
  readonly artist: string;
  readonly pair: LanguagePair;
  readonly engineVersion: string;
  readonly feelProfile: string | null;
  readonly requestedBy: string | null;
  readonly sections: readonly Section[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a decoded payload.
 *
 * Everything here arrives from a URL somebody else composed, so nothing is
 * trusted: types are checked field by field, strings are length-capped, and any
 * shape that does not fit is rejected rather than coerced.
 */
export function fromSharePackage(input: unknown): Result<SharedSong> {
  if (!isRecord(input)) {
    return err(domainError('share_payload_invalid', 'payload is not an object'));
  }

  if (input.v !== SHARE_PACKAGE_VERSION) {
    return err(
      domainError('share_payload_invalid', `unsupported version: ${String(input.v)}`),
    );
  }

  const title = typeof input.title === 'string' ? input.title.slice(0, 200) : '';
  const artist = typeof input.artist === 'string' ? input.artist.slice(0, 200) : '';
  if (!title || !artist) {
    return err(domainError('share_payload_invalid', 'missing title or artist'));
  }

  const src = typeof input.src === 'string' ? input.src.toLowerCase() : '';
  const tgt = typeof input.tgt === 'string' ? input.tgt.toLowerCase() : '';
  if (!isLanguageCode(src) || !isTargetLanguage(tgt)) {
    return err(domainError('share_payload_invalid', 'unknown language pair'));
  }

  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    return err(domainError('share_payload_invalid', 'no sections'));
  }

  const sections: Section[] = [];
  let lineCounter = 0;

  for (const [sectionIndex, rawSection] of input.sections.entries()) {
    if (!isRecord(rawSection) || !Array.isArray(rawSection.l)) {
      return err(
        domainError('share_payload_invalid', `section ${sectionIndex} is malformed`),
      );
    }

    const lines: Line[] = [];
    for (const rawLine of rawSection.l) {
      if (!isRecord(rawLine)) continue;
      if (typeof rawLine.o !== 'string' || typeof rawLine.t !== 'string') continue;

      lines.push({
        id: `shared-${lineCounter}`,
        position: lines.length,
        original: rawLine.o.slice(0, 500),
        rendering: rawLine.t.slice(0, 500),
        note: typeof rawLine.n === 'string' ? rawLine.n.slice(0, 1200) : null,
        tags: Array.isArray(rawLine.g) ? normaliseTags(rawLine.g) : [],
      });
      lineCounter += 1;
    }

    if (lines.length === 0) continue;

    sections.push({
      id: `shared-section-${sectionIndex}`,
      position: sections.length,
      label: typeof rawSection.k === 'string' ? rawSection.k.slice(0, 120) : '',
      lines,
    });
  }

  if (sections.length === 0) {
    return err(domainError('share_payload_invalid', 'no usable lines'));
  }

  return ok({
    title,
    artist,
    pair: { source: src, target: tgt },
    engineVersion: typeof input.engine === 'string' ? input.engine.slice(0, 32) : '—',
    feelProfile: typeof input.feel === 'string' ? input.feel.slice(0, 600) : null,
    requestedBy: typeof input.by === 'string' ? input.by.slice(0, 120) : null,
    sections,
  });
}
