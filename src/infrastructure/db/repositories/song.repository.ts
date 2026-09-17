import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';
import type { Database } from '../client';
import { lines, sections, songs } from '../schema';
import type { LineRow, SectionRow, SongRow } from '../schema';
import type {
  NewSong,
  SongFilter,
  SongRepository,
  SongSummary,
} from '@/application/ports/repositories';
import type { Line, Section, Song } from '@/domain/song/song';
import type { ValidatedSection } from '@/domain/song/body';

/**
 * Drizzle-backed song storage.
 *
 * Reads come in two flavours on purpose. `listSummaries` joins nothing and
 * selects no lyric column at all, so a listing page physically cannot leak a
 * body. `findFullBySlug` returns everything and is reserved for the paths
 * allowed to see it — the share-link encoder, the maintainer area, the seed
 * importer — with the minimal-quote projection applied above it for anything
 * public.
 */
export class DrizzleSongRepository implements SongRepository {
  constructor(private readonly db: Database) {}

  async listSummaries(filter: SongFilter): Promise<readonly SongSummary[]> {
    const conditions = [];

    if (filter.source) {
      // Neapolitan songs answer to a search for Italian: the library groups them
      // there, so filtering has to agree with the grouping.
      conditions.push(
        filter.source === 'it'
          ? or(eq(songs.sourceLanguage, 'it'), eq(songs.sourceLanguage, 'nap'))
          : eq(songs.sourceLanguage, filter.source),
      );
    }

    if (filter.target) {
      conditions.push(eq(songs.targetLanguage, filter.target));
    }

    if (filter.query) {
      const needle = `%${filter.query.replace(/[%_]/g, '\\$&')}%`;
      conditions.push(or(ilike(songs.title, needle), ilike(songs.artist, needle)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    /**
     * Line counts come from a grouped subquery joined once, rather than a
     * correlated subquery evaluated per row. Two reasons: the planner can hash-
     * join it instead of running one count per song, and expressing it through
     * the query builder keeps every column table-qualified — a hand-written
     * `count(*)` over `lines` and `sections` has three tables in scope with an
     * `id` each, and Postgres rejects the ambiguity.
     */
    const lineCounts = this.db
      .select({
        songId: sections.songId,
        total: count(lines.id).as('total'),
      })
      .from(sections)
      .innerJoin(lines, eq(lines.sectionId, sections.id))
      .groupBy(sections.songId)
      .as('line_counts');

    const rows = await this.db
      .select({
        id: songs.id,
        slug: songs.slug,
        title: songs.title,
        artist: songs.artist,
        source: songs.sourceLanguage,
        target: songs.targetLanguage,
        feelProfile: songs.feelProfile,
        requestedBy: songs.requestedBy,
        validatedBy: songs.validatedBy,
        updatedAt: songs.updatedAt,
        lineCount: lineCounts.total,
      })
      .from(songs)
      // A left join, so a song with no lines yet still appears in the library
      // rather than silently vanishing from it.
      .leftJoin(lineCounts, eq(lineCounts.songId, songs.id))
      .where(where)
      .orderBy(asc(songs.artist), asc(songs.title))
      .limit(filter.limit ?? 200)
      .offset(filter.offset ?? 0);

    return rows.map((row) => ({
      ...row,
      lineCount: Number(row.lineCount ?? 0),
    }));
  }

  async listSlugs(): Promise<readonly string[]> {
    const rows = await this.db
      .select({ slug: songs.slug })
      .from(songs)
      .orderBy(desc(songs.updatedAt));
    return rows.map((row) => row.slug);
  }

  async findFullBySlug(slug: string): Promise<Song | null> {
    const [row] = await this.db.select().from(songs).where(eq(songs.slug, slug)).limit(1);
    if (!row) return null;
    return this.hydrate(row);
  }

  async findFullById(id: string): Promise<Song | null> {
    const [row] = await this.db.select().from(songs).where(eq(songs.id, id)).limit(1);
    if (!row) return null;
    return this.hydrate(row);
  }

  async updateLineRendering(lineId: string, rendering: string): Promise<void> {
    await this.db
      .update(lines)
      .set({ rendering, updatedAt: new Date() })
      .where(eq(lines.id, lineId));
  }

  /**
   * Swaps a song's body inside one transaction.
   *
   * Delete-then-insert rather than a diff: the sections are renumbered on every
   * save and line identity is not stable across a re-paste, so a diff would be
   * guesswork dressed up as precision. The cascade on `sections.song_id` takes
   * the old lines with it.
   *
   * The whole thing is one transaction because the alternative — a song with its
   * old body deleted and its new one half-inserted — is the one state nothing
   * downstream is written to survive.
   */
  async replaceBody(
    songId: string,
    newSections: readonly ValidatedSection[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(sections).where(eq(sections.songId, songId));

      for (const section of newSections) {
        const [inserted] = await tx
          .insert(sections)
          .values({ songId, position: section.position, label: section.label })
          .returning({ id: sections.id });

        if (!inserted) throw new Error('section insert returned no row');

        if (section.lines.length === 0) continue;

        await tx.insert(lines).values(
          section.lines.map((line) => ({
            sectionId: inserted.id,
            position: line.position,
            original: line.original,
            rendering: line.rendering,
            note: line.note,
            tags: [...line.tags],
          })),
        );
      }

      await tx.update(songs).set({ updatedAt: new Date() }).where(eq(songs.id, songId));
    });
  }

  /**
   * Creates a song with no body yet.
   *
   * A taken slug comes back as `null` rather than an exception: two people
   * asking for the same song in the same language is an ordinary thing to
   * happen, and the caller wants to carry on with the one that exists.
   */
  async create(input: NewSong): Promise<Song | null> {
    const [row] = await this.db
      .insert(songs)
      .values({
        slug: input.slug,
        title: input.title,
        artist: input.artist,
        sourceLanguage: input.source,
        targetLanguage: input.target,
        provenance: input.provenance,
        engineVersion: input.engineVersion,
        feelProfile: input.feelProfile,
        requestedBy: input.requestedBy,
      })
      .onConflictDoNothing({ target: songs.slug })
      .returning();

    if (!row) return null;
    return this.hydrate(row);
  }

  async countAll(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(songs);
    return Number(row?.value ?? 0);
  }

  /**
   * Loads a song's body in a single round trip and rebuilds the nested shape.
   *
   * A join plus in-memory grouping beats one query per section: the songs here
   * have a handful of sections each, and the round trips cost more than the rows.
   */
  private async hydrate(row: SongRow): Promise<Song> {
    const joined = await this.db
      .select({ section: sections, line: lines })
      .from(sections)
      .leftJoin(lines, eq(lines.sectionId, sections.id))
      .where(eq(sections.songId, row.id))
      .orderBy(asc(sections.position), asc(lines.position));

    const grouped = new Map<string, { section: SectionRow; lines: LineRow[] }>();

    for (const entry of joined) {
      const existing = grouped.get(entry.section.id);
      if (existing) {
        if (entry.line) existing.lines.push(entry.line);
      } else {
        grouped.set(entry.section.id, {
          section: entry.section,
          lines: entry.line ? [entry.line] : [],
        });
      }
    }

    const hydratedSections: Section[] = [...grouped.values()]
      .sort((a, b) => a.section.position - b.section.position)
      .map(({ section, lines: sectionLines }) => ({
        id: section.id,
        position: section.position,
        label: section.label,
        lines: sectionLines
          .sort((a, b) => a.position - b.position)
          .map(
            (line): Line => ({
              id: line.id,
              position: line.position,
              original: line.original,
              rendering: line.rendering,
              note: line.note,
              tags: line.tags,
            }),
          ),
      }));

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      artist: row.artist,
      pair: { source: row.sourceLanguage, target: row.targetLanguage },
      engineVersion: row.engineVersion,
      feelProfile: row.feelProfile,
      provenance: row.provenance,
      sections: hydratedSections,
      requestedBy: row.requestedBy,
      validatedBy: row.validatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
