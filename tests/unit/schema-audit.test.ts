import { describe, expect, it } from 'vitest';
import {
  diffSchema,
  driftSummary,
  expectedSchema,
  readDatabaseSchema,
  type ActualSchema,
  type ExpectedSchema,
  type SqlExecutor,
} from '@/infrastructure/db/schema-audit';
import { REASON_TAGS } from '@/domain/song/reason-tag';

/**
 * The audit's job is to notice that the database is behind the code. These tests
 * cover the half that needs no database: what the code expects, how a gap is
 * reported, and that a database which is *ahead* is not treated as a fault.
 */

function fakeDb(columnRows: unknown, enumRows: unknown): SqlExecutor {
  let call = 0;
  return {
    execute: async () => {
      call += 1;
      return call === 1 ? columnRows : enumRows;
    },
  };
}

describe('expectedSchema', () => {
  it('reads the tables and columns straight from the Drizzle schema', () => {
    const expected = expectedSchema();
    const songs = expected.tables.find((table) => table.table === 'songs');

    expect(songs).toBeDefined();
    // Snake-cased database names, not the camelCase property names.
    expect(songs?.columns).toContain('feel_profile');
    expect(songs?.columns).toContain('target_language');
    expect(songs?.columns).not.toContain('feelProfile');
  });

  it('covers every table the app persists to', () => {
    const names = expectedSchema().tables.map((table) => table.table);
    for (const table of [
      'songs',
      'sections',
      'lines',
      'song_requests',
      'suggestions',
      'feel_validations',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('carries enum labels, so a new reason tag is a checked change', () => {
    const reasonTag = expectedSchema().enums.find((item) => item.name === 'reason_tag');
    expect(reasonTag?.values).toEqual([...REASON_TAGS]);
  });
});

describe('diffSchema', () => {
  const expected: ExpectedSchema = {
    tables: [{ table: 'song_requests', columns: ['id', 'src', 'ready_at'] }],
    enums: [{ name: 'request_status', values: ['queued', 'ready'] }],
  };

  const inSync: ActualSchema = {
    tables: { song_requests: ['id', 'src', 'ready_at'] },
    enums: { request_status: ['queued', 'ready'] },
  };

  it('passes when the database has everything the code expects', () => {
    const drift = diffSchema(expected, inSync);
    expect(drift.ok).toBe(true);
    expect(drift.missingCount).toBe(0);
  });

  it('names a column the migration never created', () => {
    const drift = diffSchema(expected, {
      tables: { song_requests: ['id', 'src'] },
      enums: inSync.enums,
    });

    expect(drift.ok).toBe(false);
    expect(drift.missingColumns).toEqual([{ table: 'song_requests', column: 'ready_at' }]);
    expect(drift.missingCount).toBe(1);
  });

  it('reports a missing table once instead of once per column', () => {
    const drift = diffSchema(expected, { tables: {}, enums: inSync.enums });

    expect(drift.missingTables).toEqual(['song_requests']);
    expect(drift.missingColumns).toEqual([]);
    expect(drift.missingCount).toBe(1);
  });

  it('catches an enum label that exists in the domain but not in Postgres', () => {
    const drift = diffSchema(expected, {
      tables: inSync.tables,
      enums: { request_status: ['queued'] },
    });

    expect(drift.missingEnumValues).toEqual([{ enum: 'request_status', value: 'ready' }]);
  });

  it('catches an enum type that was never created', () => {
    const drift = diffSchema(expected, { tables: inSync.tables, enums: {} });

    expect(drift.missingEnums).toEqual(['request_status']);
    expect(drift.missingEnumValues).toEqual([]);
  });

  it('treats a database that is ahead of the code as healthy', () => {
    // A migration landing before the deploy that uses it is the safe order, so
    // extra columns and extra labels must not fail the check.
    const drift = diffSchema(expected, {
      tables: { song_requests: ['id', 'src', 'ready_at', 'channel_note'], songs: ['id'] },
      enums: { request_status: ['queued', 'ready', 'declined'] },
    });

    expect(drift.ok).toBe(true);
  });
});

describe('readDatabaseSchema', () => {
  it('reads rows from a driver that returns an array', async () => {
    const actual = await readDatabaseSchema(
      fakeDb(
        [
          { table_name: 'songs', column_name: 'id' },
          { table_name: 'songs', column_name: 'slug' },
        ],
        [{ enum_name: 'target_language', enum_value: 'tr' }],
      ),
    );

    expect(actual.tables.songs).toEqual(['id', 'slug']);
    expect(actual.enums.target_language).toEqual(['tr']);
  });

  it('reads rows from a driver that wraps them in { rows }', async () => {
    const actual = await readDatabaseSchema(
      fakeDb(
        { rows: [{ table_name: 'lines', column_name: 'note' }] },
        { rows: [{ enum_name: 'reason_tag', enum_value: 'feel' }] },
      ),
    );

    expect(actual.tables.lines).toEqual(['note']);
    expect(actual.enums.reason_tag).toEqual(['feel']);
  });

  it('survives a driver that returns something unexpected', async () => {
    const actual = await readDatabaseSchema(fakeDb(null, undefined));
    expect(actual).toEqual({ tables: {}, enums: {} });
  });
});

describe('driftSummary', () => {
  it('says the schema matches when nothing is missing', () => {
    const summary = driftSummary({
      ok: true,
      missingTables: [],
      missingColumns: [],
      missingEnums: [],
      missingEnumValues: [],
      missingCount: 0,
    });

    expect(summary).toMatch(/matches/i);
  });

  it('names what to run the migration for', () => {
    const summary = driftSummary({
      ok: false,
      missingTables: [],
      missingColumns: [{ table: 'song_requests', column: 'ready_at' }],
      missingEnums: [],
      missingEnumValues: [{ enum: 'reason_tag', value: 'idiom-twin' }],
      missingCount: 2,
    });

    expect(summary).toContain('song_requests.ready_at');
    expect(summary).toContain('reason_tag.idiom-twin');
    expect(summary).toMatch(/migration/i);
  });
});
