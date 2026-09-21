import { domainError, err, isErr, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import { extractLyrics } from '@/domain/lyrics/extract';
import { assembleEngineDraft, buildEngineBrief, extractJsonObject } from '@/domain/song/engine-output';
import { validateSongBody } from '@/domain/song/body';
import { countLines } from '@/domain/song/song';
import type { Song } from '@/domain/song/song';
import { songSlug as buildSlug } from '@/domain/shared/slug';
import { transition } from '@/domain/request/song-request';
import type { LanguageCode, TargetLanguage } from '@/domain/shared/language';
import type { TranscreationEngine } from '../ports/engine';
import type { RateLimiter, RequestRepository, SongRepository } from '../ports/repositories';

/**
 * "Translate now": the whole loop in one call.
 *
 * Somebody has a song open on their phone and a friend beside them who did not
 * get it. The queue is the wrong instrument for that moment — it answers in
 * days. This path answers in a minute: shape the paste, brief the engine, check
 * the answer line by line, publish the song, and hand back a link that carries
 * the whole translation.
 *
 * The result is an AI draft and says so on the page (no `validatedBy`). Human
 * feel-checks arrive later through suggestions; nothing here pretends
 * otherwise.
 */

export interface TranslateNowPort {
  readonly songs: SongRepository;
  readonly requests: RequestRepository;
  readonly rateLimiter: RateLimiter;
  readonly engine: TranscreationEngine | null;
}

/** Engine calls are the expensive thing on the site; the window is per person. */
export const TRANSLATE_RATE_LIMIT = 6;
export const TRANSLATE_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface TranslateNowCommand {
  readonly title: string;
  readonly artist: string;
  readonly source: LanguageCode;
  readonly target: TargetLanguage;
  readonly lyrics: string;
  readonly requesterAlias: string | null;
  readonly requesterNote: string | null;
  /** The queue row this translation fulfils, when there is one. */
  readonly requestId: string | null;
  /** Close the request after this target — the caller knows if it is the last. */
  readonly closeRequest: boolean;
  readonly submitterKey: string;
}

export interface TranslateNowResult {
  readonly song: Song;
  /** True when the song already had a body and nothing was generated. */
  readonly existing: boolean;
  readonly unannotated: number;
}

export async function translateNow(
  deps: TranslateNowPort,
  command: TranslateNowCommand,
): Promise<Result<TranslateNowResult>> {
  if (!deps.engine) {
    return err(domainError('engine_unavailable', 'no ANTHROPIC_API_KEY configured'));
  }

  const title = command.title.trim();
  const artist = command.artist.trim();
  if (title.length === 0) return err(domainError('invalid_input', 'title required', 'title'));
  if (artist.length === 0) return err(domainError('invalid_input', 'artist required', 'artist'));
  if (command.source === command.target) {
    return err(domainError('unsupported_language', 'source equals target', 'source'));
  }

  const slug = buildSlug(artist, title, command.source, command.target);

  // A song that already has a body is served, not regenerated: the second
  // person to bring the same song gets the first person's page — and any human
  // fixes it has collected since.
  const already = await deps.songs.findFullBySlug(slug);
  if (already && countLines(already) > 0) {
    if (command.closeRequest) await closeRequest(deps, command.requestId, slug);
    return ok({ song: already, existing: true, unannotated: 0 });
  }

  const allowed = await deps.rateLimiter.check(
    `translate:${command.submitterKey}`,
    TRANSLATE_RATE_LIMIT,
    TRANSLATE_RATE_WINDOW_MS,
  );
  if (!allowed) return err(domainError('rate_limited', 'too many engine calls'));

  const extraction = extractLyrics(command.lyrics);
  if (isErr(extraction)) return extraction;

  const brief = buildEngineBrief(extraction.value, {
    title,
    artist,
    source: command.source,
    target: command.target,
    requesterNote: command.requesterNote,
  });

  let reply: string;
  try {
    reply = await deps.engine.draft(brief);
  } catch (error) {
    return err(
      domainError('engine_failed', error instanceof Error ? error.message : 'engine call failed'),
    );
  }

  const draft = assembleEngineDraft(brief, extractJsonObject(reply));
  if (isErr(draft)) return draft;

  const validated = validateSongBody(draft.value.sections);
  if (isErr(validated)) {
    return err(domainError('engine_failed', `draft rejected: ${validated.error.detail ?? ''}`));
  }

  const song =
    already ??
    (await deps.songs.create({
      slug,
      title,
      artist,
      source: command.source,
      target: command.target,
      provenance: 'user-paste',
      engineVersion: deps.engine.version,
      feelProfile: draft.value.feelProfile,
      requestedBy: command.requesterAlias,
    })) ??
    (await deps.songs.findFullBySlug(slug));

  if (!song) return err(domainError('conflict', 'song row could not be created', 'slug'));

  await deps.songs.replaceBody(song.id, validated.value.sections);
  if (draft.value.feelProfile && song.feelProfile !== draft.value.feelProfile) {
    await deps.songs.setFeelProfile(song.id, draft.value.feelProfile);
  }

  if (command.closeRequest) await closeRequest(deps, command.requestId, slug);

  const published = await deps.songs.findFullBySlug(slug);
  if (!published) return err(domainError('not_found', 'song vanished after publish', 'slug'));

  return ok({ song: published, existing: false, unannotated: draft.value.unannotated });
}

/**
 * Marks the queue row ready, which also discards the pasted words — the
 * promise the form makes. Silent when there is no row, or it is already closed.
 */
async function closeRequest(
  deps: TranslateNowPort,
  requestId: string | null,
  slug: string,
): Promise<void> {
  if (!requestId) return;
  const request = await deps.requests.findById(requestId);
  if (!request || request.status === 'ready' || request.status === 'declined') return;

  const staged = request.status === 'lyrics-needed' ? transition(request, 'queued') : ok(request);
  if (isErr(staged)) return;
  const moved = transition(staged.value, 'ready', slug);
  if (isErr(moved)) return;
  await deps.requests.save(moved.value);
}
