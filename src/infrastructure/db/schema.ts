import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { LANGUAGE_CODES, TARGET_LANGUAGES } from '@/domain/shared/language';
import { REQUEST_STATUSES } from '@/domain/request/song-request';
import { SUGGESTION_STATUSES } from '@/domain/suggestion/suggestion';
import { REASON_TAGS } from '@/domain/song/reason-tag';

/**
 * The PostgreSQL schema.
 *
 * Enum values are imported from the domain rather than retyped here, so the
 * database and the business rules cannot drift apart: adding a reason tag in one
 * place and forgetting the other becomes a migration error instead of a runtime
 * surprise.
 */

export const languageEnum = pgEnum('language_code', LANGUAGE_CODES);
export const targetLanguageEnum = pgEnum('target_language', TARGET_LANGUAGES);
export const requestStatusEnum = pgEnum('request_status', REQUEST_STATUSES);
export const suggestionStatusEnum = pgEnum('suggestion_status', SUGGESTION_STATUSES);
export const reasonTagEnum = pgEnum('reason_tag', REASON_TAGS);

/**
 * How the lyrics reached us. There is no default: a row without provenance
 * cannot be published, and the absence must be loud rather than convenient.
 */
export const provenanceEnum = pgEnum('lyrics_provenance', [
  'user-paste',
  'public-domain',
  'licensed',
]);

export const songs = pgTable(
  'songs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    sourceLanguage: languageEnum('source_language').notNull(),
    targetLanguage: targetLanguageEnum('target_language').notNull(),
    engineVersion: text('engine_version').notNull().default('0.1.1'),
    /** One line in the target language naming the emotion the song runs on. */
    feelProfile: text('feel_profile'),
    provenance: provenanceEnum('provenance').notNull(),
    /** Public credit when the song exists because somebody asked for it. */
    requestedBy: text('requested_by'),
    /** Alias of the native speaker who signed the translation off. */
    validatedBy: text('validated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('songs_slug_key').on(table.slug),
    index('songs_pair_idx').on(table.sourceLanguage, table.targetLanguage),
    index('songs_updated_idx').on(table.updatedAt),
  ],
);

export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** Written in the target language, like everything else the reader sees. */
    label: text('label').notNull(),
  },
  (table) => [
    index('sections_song_idx').on(table.songId, table.position),
    uniqueIndex('sections_song_position_key').on(table.songId, table.position),
  ],
);

export const lines = pgTable(
  'lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    original: text('original').notNull(),
    rendering: text('rendering').notNull(),
    note: text('note'),
    tags: reasonTagEnum('tags').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lines_section_idx').on(table.sectionId, table.position),
    uniqueIndex('lines_section_position_key').on(table.sectionId, table.position),
  ],
);

export const songRequests = pgTable(
  'song_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    targets: targetLanguageEnum('targets').array().notNull(),
    requesterAlias: text('requester_alias'),
    /** One line from the asker on why this song. */
    requesterNote: text('requester_note'),
    hasLyrics: boolean('has_lyrics').notNull().default(false),
    /** How many lines the paste held. */
    lyricLineCount: integer('lyric_line_count'),
    /**
     * The asker's paste, held only while the request is open and cleared when it
     * is fulfilled or declined. A translated song's body lives in `lines`; this
     * column exists so the person doing the translating has something to work
     * from in between.
     */
    pastedLyrics: text('pasted_lyrics'),
    status: requestStatusEnum('status').notNull().default('lyrics-needed'),
    /** Points at the published song once the request is fulfilled. */
    songSlug: text('song_slug'),
    /**
     * Lower-cased title+artist, so "Şımarık / Tarkan" and "şimarik / tarkan"
     * collapse onto the same queue entry.
     */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('requests_status_idx').on(table.status, table.createdAt),
    index('requests_dedupe_idx').on(table.dedupeKey, table.createdAt),
  ],
);

export const suggestions = pgTable(
  'suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => lines.id, { onDelete: 'cascade' }),
    /** Snapshots, so the pair survives the line being edited afterwards. */
    originalLine: text('original_line').notNull(),
    engineDraft: text('engine_draft').notNull(),
    proposedRendering: text('proposed_rendering').notNull(),
    tags: reasonTagEnum('tags').array().notNull(),
    comment: text('comment'),
    contributorAlias: text('contributor_alias'),
    status: suggestionStatusEnum('status').notNull().default('proposed'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (table) => [
    index('suggestions_song_idx').on(table.songId, table.createdAt),
    index('suggestions_line_idx').on(table.lineId, table.createdAt),
    index('suggestions_status_idx').on(table.status, table.createdAt),
  ],
);

/**
 * Rate-limit ledger.
 *
 * A table rather than a Redis instance, on purpose: at this volume Postgres is
 * plenty, and one fewer service is one fewer account for a non-technical founder
 * to hold. The adapter behind `RateLimiter` can be swapped without the use cases
 * being touched if that ever stops being true.
 */
export const rateLimitEvents = pgTable(
  'rate_limit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucketKey: text('bucket_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('rate_limit_bucket_idx').on(table.bucketKey, table.occurredAt)],
);

/**
 * Append-only record of validated feel decisions — the dataset the project
 * exists to build. Kept separate from `suggestions` because a validation can
 * come from a live conversation as well as from the app, and because this table
 * is meant to be exported wholesale.
 */
export const feelValidations = pgTable(
  'feel_validations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id').references(() => songs.id, { onDelete: 'set null' }),
    lineId: uuid('line_id').references(() => lines.id, { onDelete: 'set null' }),
    pair: text('pair').notNull(),
    originalLine: text('original_line').notNull(),
    engineDraft: text('engine_draft').notNull(),
    humanRendering: text('human_rendering').notNull(),
    tags: reasonTagEnum('tags').array().notNull().default([]),
    validator: text('validator').notNull(),
    source: text('source').notNull(),
    reviewNote: text('review_note'),
    /** Contributor-licence version in force when this was recorded. */
    termsVersion: text('terms_version').notNull().default('1.0'),
    /** Anything that does not fit a column yet, rather than a schema change per idea. */
    metadata: jsonb('metadata'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('validations_song_idx').on(table.songId, table.recordedAt)],
);

export const songsRelations = relations(songs, ({ many }) => ({
  sections: many(sections),
  suggestions: many(suggestions),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  song: one(songs, { fields: [sections.songId], references: [songs.id] }),
  lines: many(lines),
}));

export const linesRelations = relations(lines, ({ one, many }) => ({
  section: one(sections, { fields: [lines.sectionId], references: [sections.id] }),
  suggestions: many(suggestions),
}));

export const suggestionsRelations = relations(suggestions, ({ one }) => ({
  song: one(songs, { fields: [suggestions.songId], references: [songs.id] }),
  line: one(lines, { fields: [suggestions.lineId], references: [lines.id] }),
}));

export type SongRow = typeof songs.$inferSelect;
export type SectionRow = typeof sections.$inferSelect;
export type LineRow = typeof lines.$inferSelect;
export type SongRequestRow = typeof songRequests.$inferSelect;
export type SuggestionRow = typeof suggestions.$inferSelect;
