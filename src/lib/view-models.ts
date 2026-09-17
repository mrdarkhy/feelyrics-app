import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import type { ReasonTag } from '@/domain/song/reason-tag';
import type { PublicSong } from '@/domain/song/song';
import type { SharedSong } from '@/domain/song/share-package';
import type { SongRequest } from '@/domain/request/song-request';
import type { SongSummary } from '@/application/ports/repositories';

/**
 * View models — the plain shapes that cross from server components into client
 * ones.
 *
 * Domain entities do not make the trip. Partly because `Date` and branded types
 * serialise awkwardly, but mostly because a client component should not be able
 * to reach for a field the page did not intend to send: the boundary is a good
 * place to make "what the browser gets" an explicit list rather than whatever
 * the entity happens to hold.
 */

export interface LineView {
  readonly id: string;
  readonly position: number;
  readonly original: string;
  readonly rendering: string;
  readonly note: string | null;
  readonly tags: readonly ReasonTag[];
}

export interface SectionView {
  readonly id: string;
  readonly label: string;
  readonly lines: readonly LineView[];
}

export interface SongView {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  readonly source: LanguageCode;
  readonly target: TargetLanguage;
  readonly engineVersion: string;
  readonly feelProfile: string | null;
  readonly requestedBy: string | null;
  readonly validatedBy: string | null;
  readonly sections: readonly SectionView[];
  /** True when the minimal-quote policy withheld lines. */
  readonly truncated: boolean;
  readonly totalLineCount: number;
  readonly shownLineCount: number;
  readonly isPublicDomain: boolean;
}

export function toSongView(song: PublicSong): SongView {
  const sections = song.sections.map(
    (section): SectionView => ({
      id: section.id,
      label: section.label,
      lines: section.lines.map((line) => ({
        id: line.id,
        position: line.position,
        original: line.original,
        rendering: line.rendering,
        note: line.note,
        tags: line.tags,
      })),
    }),
  );

  return {
    id: song.id,
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    source: song.pair.source,
    target: song.pair.target,
    engineVersion: song.engineVersion,
    feelProfile: song.feelProfile,
    requestedBy: song.requestedBy,
    validatedBy: song.validatedBy,
    sections,
    truncated: song.truncated,
    totalLineCount: song.totalLineCount,
    shownLineCount: sections.reduce((n, s) => n + s.lines.length, 0),
    isPublicDomain: song.provenance === 'public-domain',
  };
}

/**
 * A song reconstructed from a share link.
 *
 * It has no slug and no id, because it does not exist on this site — it exists
 * in the link. The distinct shape keeps that difference visible in the code.
 */
export interface SharedSongView {
  readonly title: string;
  readonly artist: string;
  readonly source: LanguageCode;
  readonly target: TargetLanguage;
  readonly engineVersion: string;
  readonly feelProfile: string | null;
  readonly requestedBy: string | null;
  readonly sections: readonly SectionView[];
}

export function toSharedSongView(song: SharedSong): SharedSongView {
  return {
    title: song.title,
    artist: song.artist,
    source: song.pair.source,
    target: song.pair.target,
    engineVersion: song.engineVersion,
    feelProfile: song.feelProfile,
    requestedBy: song.requestedBy,
    sections: song.sections.map((section) => ({
      id: section.id,
      label: section.label,
      lines: section.lines.map((line) => ({
        id: line.id,
        position: line.position,
        original: line.original,
        rendering: line.rendering,
        note: line.note,
        tags: line.tags,
      })),
    })),
  };
}

export interface SongSummaryView {
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  readonly source: LanguageCode;
  readonly target: TargetLanguage;
  readonly feelProfile: string | null;
  readonly requestedBy: string | null;
  readonly validatedBy: string | null;
  readonly lineCount: number;
  /**
   * ISO string. Sorting by recency happens in the browser, so the value has to
   * survive the server-to-client hop — `Date` does not, and comparing ISO-8601
   * strings lexicographically is the same ordering anyway.
   */
  readonly updatedAt: string;
}

export function toSongSummaryView(summary: SongSummary): SongSummaryView {
  return {
    slug: summary.slug,
    title: summary.title,
    artist: summary.artist,
    source: summary.source,
    target: summary.target,
    feelProfile: summary.feelProfile,
    requestedBy: summary.requestedBy,
    validatedBy: summary.validatedBy,
    lineCount: summary.lineCount,
    updatedAt: summary.updatedAt.toISOString(),
  };
}

export interface RequestView {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly targets: readonly TargetLanguage[];
  readonly requesterAlias: string | null;
  readonly status: SongRequest['status'];
  readonly songSlug: string | null;
  /** ISO string: `Date` objects serialise, but the string is unambiguous. */
  readonly createdAt: string;
}

export function toRequestView(request: SongRequest): RequestView {
  return {
    id: request.id,
    title: request.title,
    artist: request.artist,
    targets: request.targets,
    requesterAlias: request.requesterAlias,
    status: request.status,
    songSlug: request.songSlug,
    createdAt: request.createdAt.toISOString(),
  };
}
