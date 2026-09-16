import { domainError, err, ok } from '@/domain/shared/result';
import type { Result } from '@/domain/shared/result';
import { toPublicSong, mayTravelInShareLink } from '@/domain/song/minimal-quote.policy';
import type { PublicSong, Song } from '@/domain/song/song';
import { toSharePackage } from '@/domain/song/share-package';
import type { SharePackage } from '@/domain/song/share-package';
import type {
  SongFilter,
  SongRepository,
  SongSummary,
} from '../ports/repositories';

/**
 * Read paths for songs.
 *
 * `getPublicSong` is the only one a page may use, and it returns the branded
 * `PublicSong` that the minimal-quote policy produces. There is deliberately no
 * public use case that hands back a raw `Song`.
 */

export interface SongsPort {
  readonly songs: SongRepository;
}

export async function listSongs(
  deps: SongsPort,
  filter: SongFilter = {},
): Promise<readonly SongSummary[]> {
  return deps.songs.listSummaries({
    ...filter,
    limit: Math.min(filter.limit ?? 200, 500),
  });
}

export async function getPublicSong(
  deps: SongsPort,
  slug: string,
): Promise<Result<PublicSong>> {
  const song = await deps.songs.findFullBySlug(slug);
  if (!song) return err(domainError('not_found', `no song with slug ${slug}`));
  return ok(toPublicSong(song));
}

/**
 * Builds the payload for a share link.
 *
 * Returns the package, not a URL: assembling and compressing the fragment is the
 * codec's job, and keeping them apart means this use case stays testable without
 * a compression library.
 */
export async function getSharePackage(
  deps: SongsPort,
  slug: string,
): Promise<Result<SharePackage>> {
  const song = await deps.songs.findFullBySlug(slug);
  if (!song) return err(domainError('not_found', `no song with slug ${slug}`));

  if (!mayTravelInShareLink(song)) {
    return err(
      domainError('forbidden', 'this song may not be shared in full', 'provenance'),
    );
  }

  return ok(toSharePackage(song));
}

/**
 * Full access, for the maintainer area only. The caller must have already
 * established that the request is authenticated; this use case does not check,
 * it just refuses to pretend it is a public read.
 */
export async function getSongForMaintainer(
  deps: SongsPort,
  slug: string,
): Promise<Result<Song>> {
  const song = await deps.songs.findFullBySlug(slug);
  if (!song) return err(domainError('not_found', `no song with slug ${slug}`));
  return ok(song);
}

export async function listSongSlugs(deps: SongsPort): Promise<readonly string[]> {
  return deps.songs.listSlugs();
}
