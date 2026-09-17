import { and, desc, eq, gte, ne, count } from 'drizzle-orm';
import type { Database } from '../client';
import { songRequests } from '../schema';
import type { SongRequestRow } from '../schema';
import type {
  RequestFilter,
  RequestRepository,
} from '@/application/ports/repositories';
import type {
  SongRequest,
  ValidatedRequest,
} from '@/domain/request/song-request';

function dedupeKey(title: string, artist: string): string {
  return `${title} ${artist}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function toDomain(row: SongRequestRow): SongRequest {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    targets: row.targets,
    requesterAlias: row.requesterAlias,
    requesterNote: row.requesterNote,
    hasLyrics: row.hasLyrics,
    lyricLineCount: row.lyricLineCount,
    status: row.status,
    songSlug: row.songSlug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleRequestRepository implements RequestRepository {
  constructor(private readonly db: Database) {}

  async list(filter: RequestFilter): Promise<readonly SongRequest[]> {
    const conditions = [];
    if (filter.status) conditions.push(eq(songRequests.status, filter.status));
    // Declined requests stay in the table — a queue that quietly forgets what it
    // turned down invites the same ask again — but they are out of the public
    // view unless somebody explicitly wants them.
    if (!filter.includeDeclined && !filter.status) {
      conditions.push(ne(songRequests.status, 'declined'));
    }

    const rows = await this.db
      .select()
      .from(songRequests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(songRequests.createdAt))
      .limit(filter.limit ?? 100);

    return rows.map(toDomain);
  }

  async findById(id: string): Promise<SongRequest | null> {
    const [row] = await this.db
      .select()
      .from(songRequests)
      .where(eq(songRequests.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: ValidatedRequest): Promise<SongRequest> {
    const [row] = await this.db
      .insert(songRequests)
      .values({
        title: input.title,
        artist: input.artist,
        targets: [...input.targets],
        requesterAlias: input.requesterAlias,
        requesterNote: input.requesterNote,
        hasLyrics: input.hasLyrics,
        lyricLineCount: input.lyricLineCount,
        status: input.status,
        dedupeKey: dedupeKey(input.title, input.artist),
      })
      .returning();

    if (!row) throw new Error('Insert into song_requests returned no row.');
    return toDomain(row);
  }

  async save(request: SongRequest): Promise<SongRequest> {
    const [row] = await this.db
      .update(songRequests)
      .set({
        status: request.status,
        songSlug: request.songSlug,
        hasLyrics: request.hasLyrics,
        lyricLineCount: request.lyricLineCount,
        requesterAlias: request.requesterAlias,
        requesterNote: request.requesterNote,
        updatedAt: new Date(),
      })
      .where(eq(songRequests.id, request.id))
      .returning();

    if (!row) throw new Error(`No request with id ${request.id}.`);
    return toDomain(row);
  }

  async findRecentDuplicate(
    title: string,
    artist: string,
    withinMs: number,
  ): Promise<SongRequest | null> {
    const since = new Date(Date.now() - withinMs);
    const [row] = await this.db
      .select()
      .from(songRequests)
      .where(
        and(
          eq(songRequests.dedupeKey, dedupeKey(title, artist)),
          gte(songRequests.createdAt, since),
        ),
      )
      .orderBy(desc(songRequests.createdAt))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async countSince(since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(songRequests)
      .where(gte(songRequests.createdAt, since));
    return Number(row?.value ?? 0);
  }
}
