import { domainError, err, isErr, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import { validateSongBody } from '@/domain/song/body';
import type { DraftSection } from '@/domain/song/body';
import { countLines } from '@/domain/song/song';
import type { Song } from '@/domain/song/song';
import { extractLyrics } from '@/domain/lyrics/extract';
import type { ExtractionResult } from '@/domain/lyrics/extract';
import { songSlug as buildSlug } from '@/domain/shared/slug';
import { transition } from '@/domain/request/song-request';
import type { LanguageCode } from '@/domain/shared/language';
import type { SongRequest } from '@/domain/request/song-request';
import type { RequestRepository, SongRepository } from '../ports/repositories';

/**
 * The engine version stamped on a song created here.
 *
 * A literal for now, because the "engine" is still a person following a method
 * rather than a program. When that changes this becomes the thing that says
 * which version of it produced a given line, and the suggestions collected
 * against each version are what make the comparison mean something.
 */
export const CURRENT_ENGINE_VERSION = '0.1.1';

/**
 * Writing a song's body — the maintainer path.
 *
 * Every function here assumes the caller has already established that the
 * request is from the maintainer. None of them check: authorisation belongs at
 * the edge, and a use case that half-checks invites callers to believe it fully
 * checks.
 */

export interface SongBodyPort {
  readonly songs: SongRepository;
  readonly requests: RequestRepository;
}

export interface CreateSongsFromRequestCommand {
  readonly requestId: string;
  /** The song's own language. The asker names the targets, never this. */
  readonly source: LanguageCode;
}

export interface CreateSongsFromRequestResult {
  readonly created: readonly string[];
  /** Slugs that already existed — the same song asked for twice. */
  readonly existing: readonly string[];
  readonly request: SongRequest;
}

/**
 * Turns a request into the song rows it asked for.
 *
 * One song per target language, because a TR→EN rendering and a TR→ES rendering
 * are different artefacts with different notes — the same reason they have
 * different URLs. The bodies are left empty: this only opens the files, the
 * lyrics desk fills them.
 *
 * The request is pointed at the first song it produced, which is what lets the
 * body being saved later close the request on its own.
 */
export async function createSongsFromRequest(
  deps: SongBodyPort,
  command: CreateSongsFromRequestCommand,
): Promise<Result<CreateSongsFromRequestResult>> {
  const request = await deps.requests.findById(command.requestId);
  if (!request) {
    return err(domainError('not_found', 'no such request', 'requestId'));
  }

  if (request.targets.length === 0) {
    return err(domainError('invalid_input', 'the request names no target language'));
  }

  if (command.source === undefined) {
    return err(domainError('invalid_input', 'a source language is required', 'source'));
  }

  const created: string[] = [];
  const existing: string[] = [];

  for (const target of request.targets) {
    if (target === command.source) {
      // Translating a song into its own language is a typo, not an artefact.
      continue;
    }

    const slug = buildSlug(request.artist, request.title, command.source, target);

    const song = await deps.songs.create({
      slug,
      title: request.title,
      artist: request.artist,
      source: command.source,
      target,
      provenance: 'user-paste',
      engineVersion: CURRENT_ENGINE_VERSION,
      feelProfile: null,
      requestedBy: request.requesterAlias,
    });

    if (song) created.push(slug);
    else existing.push(slug);
  }

  if (created.length === 0 && existing.length === 0) {
    return err(
      domainError(
        'unsupported_language',
        'every target matched the source language',
        'source',
      ),
    );
  }

  const first = created[0] ?? existing[0] ?? null;
  const linked = await deps.requests.save({
    ...request,
    songSlug: first,
    updatedAt: new Date(),
  });

  return ok({ created, existing, request: linked });
}

/**
 * The words the asker pasted, if the request they came with is still open.
 *
 * This is the other half of keeping them: the editor opens on the song and the
 * lyric is already in the box, so nobody has to go and ask for it again.
 */
export async function getPasteForSong(
  deps: SongBodyPort,
  slug: string,
): Promise<string | null> {
  const request = await deps.requests.findBySongSlug(slug);
  return request?.pastedLyrics ?? null;
}

/**
 * Closes the request a song was created for, once the song has a body.
 *
 * Silent when there is nothing to close: most saves are edits to songs nobody
 * requested, and a missing request is the normal case rather than a failure.
 * The transition clears the stored lyric, which is the promise the form makes.
 */
export async function closeRequestForSong(
  deps: SongBodyPort,
  slug: string,
): Promise<boolean> {
  const request = await deps.requests.findBySongSlug(slug);
  if (!request || request.status === 'ready') return false;

  const moved = transition(request, 'ready', slug);
  if (isErr(moved)) return false;

  await deps.requests.save(moved.value);
  return true;
}

export interface ReplaceSongBodyCommand {
  readonly slug: string;
  readonly sections: readonly DraftSection[];
}

export interface ReplaceSongBodyResult {
  readonly slug: string;
  readonly lineCount: number;
  /** Lines the song held before the swap — worth reporting back to a human. */
  readonly previousLineCount: number;
}

export async function replaceSongBody(
  deps: SongBodyPort,
  command: ReplaceSongBodyCommand,
): Promise<Result<ReplaceSongBodyResult>> {
  const song = await deps.songs.findFullBySlug(command.slug);
  if (!song) {
    return err(domainError('not_found', `no song with slug ${command.slug}`, 'slug'));
  }

  const validated = validateSongBody(command.sections);
  if (isErr(validated)) return validated;

  const previousLineCount = countLines(song);

  await deps.songs.replaceBody(song.id, validated.value.sections);

  return ok({
    slug: song.slug,
    lineCount: validated.value.lineCount,
    previousLineCount,
  });
}

/**
 * The song as the editor needs it: everything, lyrics included.
 *
 * Deliberately a separate use case from `getSongForMaintainer` even though both
 * return a full `Song` — this one names the reason a page is asking, so a future
 * audit of who reads whole lyrics has something to read.
 */
export async function getSongForEditing(
  deps: SongBodyPort,
  slug: string,
): Promise<Result<Song>> {
  const song = await deps.songs.findFullBySlug(slug);
  if (!song) return err(domainError('not_found', `no song with slug ${slug}`, 'slug'));
  return ok(song);
}

/**
 * Structures a paste for the editor.
 *
 * The public endpoint does the same work behind a rate limit meant for
 * strangers; the maintainer pasting fifty songs in an evening is not the abuse
 * that limit exists for, and nothing is stored here either way.
 */
export function extractForEditing(lyrics: string): Result<ExtractionResult> {
  return extractLyrics(lyrics);
}
