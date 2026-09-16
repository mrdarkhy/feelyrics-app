import { and, count, desc, eq, gte } from 'drizzle-orm';
import type { Database } from '../client';
import { suggestions } from '../schema';
import type { SuggestionRow } from '../schema';
import type {
  SuggestionFilter,
  SuggestionRepository,
} from '@/application/ports/repositories';
import type {
  Suggestion,
  ValidatedSuggestion,
} from '@/domain/suggestion/suggestion';

function toDomain(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    songId: row.songId,
    lineId: row.lineId,
    originalLine: row.originalLine,
    engineDraft: row.engineDraft,
    proposedRendering: row.proposedRendering,
    tags: row.tags,
    comment: row.comment,
    contributorAlias: row.contributorAlias,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

export class DrizzleSuggestionRepository implements SuggestionRepository {
  constructor(private readonly db: Database) {}

  async list(filter: SuggestionFilter): Promise<readonly Suggestion[]> {
    const conditions = [];
    if (filter.songId) conditions.push(eq(suggestions.songId, filter.songId));
    if (filter.status) conditions.push(eq(suggestions.status, filter.status));

    const rows = await this.db
      .select()
      .from(suggestions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(suggestions.createdAt))
      .limit(filter.limit ?? 100);

    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Suggestion | null> {
    const [row] = await this.db
      .select()
      .from(suggestions)
      .where(eq(suggestions.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async create(input: ValidatedSuggestion): Promise<Suggestion> {
    const [row] = await this.db
      .insert(suggestions)
      .values({
        songId: input.songId,
        lineId: input.lineId,
        originalLine: input.originalLine,
        engineDraft: input.engineDraft,
        proposedRendering: input.proposedRendering,
        tags: [...input.tags],
        comment: input.comment,
        contributorAlias: input.contributorAlias,
        status: 'proposed',
      })
      .returning();

    if (!row) throw new Error('Insert into suggestions returned no row.');
    return toDomain(row);
  }

  async save(suggestion: Suggestion): Promise<Suggestion> {
    const [row] = await this.db
      .update(suggestions)
      .set({
        status: suggestion.status,
        reviewNote: suggestion.reviewNote,
        reviewedAt: suggestion.reviewedAt,
      })
      .where(eq(suggestions.id, suggestion.id))
      .returning();

    if (!row) throw new Error(`No suggestion with id ${suggestion.id}.`);
    return toDomain(row);
  }

  async countForLineSince(lineId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(suggestions)
      .where(
        and(eq(suggestions.lineId, lineId), gte(suggestions.createdAt, since)),
      );
    return Number(row?.value ?? 0);
  }
}
