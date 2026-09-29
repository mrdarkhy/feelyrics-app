import { getTableColumns, getTableName, is, sql, type SQL } from 'drizzle-orm';
import { PgTable, isPgEnum } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Schema drift detection.
 *
 * There is one failure this project keeps meeting and no test catches: the code
 * ships and the migration does not. A new column is added in `schema.ts`, the
 * deploy is green, the build typechecks — and every query touching that column
 * fails at runtime, in production, silently, because the column only exists in
 * the file. The same holds for enum labels: adding a reason tag to the domain
 * list is a one-line change here and a `CREATE TYPE ... ADD VALUE` there.
 *
 * So the expected shape is not written down twice. It is derived from the
 * Drizzle schema at runtime and compared against what the database actually
 * has. Nothing to keep in sync: a column added tomorrow is audited tomorrow.
 *
 * The comparison is deliberately one-directional. Columns and types the
 * database has and the code does not are *not* drift — a migration may land
 * before the deploy that uses it, and that order is the safe one. Only the
 * opposite gap breaks requests.
 */

export interface ExpectedTable {
  table: string;
  columns: string[];
}

export interface ExpectedEnum {
  name: string;
  values: string[];
}

export interface ExpectedSchema {
  tables: ExpectedTable[];
  enums: ExpectedEnum[];
}

export interface ActualSchema {
  /** Table name → column names present in the database. */
  tables: Record<string, string[]>;
  /** Enum type name → labels present in the database. */
  enums: Record<string, string[]>;
}

export interface MissingColumn {
  table: string;
  column: string;
}

export interface MissingEnumValue {
  enum: string;
  value: string;
}

export interface SchemaDrift {
  ok: boolean;
  missingTables: string[];
  missingColumns: MissingColumn[];
  missingEnums: string[];
  missingEnumValues: MissingEnumValue[];
  /** Total number of missing things, for a caller that only needs a number. */
  missingCount: number;
}

/**
 * A minimal view of the database handle: anything that can run a statement.
 * Narrow on purpose — the audit needs no repository, no transaction and no
 * model, and a one-method port is trivial to fake in a test.
 */
export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}

/** The shape the code expects, read from the Drizzle schema itself. */
export function expectedSchema(): ExpectedSchema {
  const tables: ExpectedTable[] = [];
  const enums: ExpectedEnum[] = [];

  for (const value of Object.values(schema)) {
    if (is(value as never, PgTable)) {
      const table = value as unknown as PgTable;
      tables.push({
        table: getTableName(table),
        columns: Object.values(getTableColumns(table)).map((column) => column.name),
      });
      continue;
    }

    if (isPgEnum(value as never)) {
      const pgEnum = value as unknown as { enumName: string; enumValues: readonly string[] };
      enums.push({ name: pgEnum.enumName, values: [...pgEnum.enumValues] });
    }
  }

  tables.sort((a, b) => a.table.localeCompare(b.table));
  enums.sort((a, b) => a.name.localeCompare(b.name));

  return { tables, enums };
}

/** Pure comparison, so the interesting half of this file needs no database. */
export function diffSchema(expected: ExpectedSchema, actual: ActualSchema): SchemaDrift {
  const missingTables: string[] = [];
  const missingColumns: MissingColumn[] = [];
  const missingEnums: string[] = [];
  const missingEnumValues: MissingEnumValue[] = [];

  for (const { table, columns } of expected.tables) {
    const present = actual.tables[table];
    if (!present) {
      // One line per missing table, not one per column: a table that does not
      // exist yet would otherwise bury everything else under its own columns.
      missingTables.push(table);
      continue;
    }
    const presentSet = new Set(present);
    for (const column of columns) {
      if (!presentSet.has(column)) missingColumns.push({ table, column });
    }
  }

  for (const { name, values } of expected.enums) {
    const present = actual.enums[name];
    if (!present) {
      missingEnums.push(name);
      continue;
    }
    const presentSet = new Set(present);
    for (const value of values) {
      if (!presentSet.has(value)) missingEnumValues.push({ enum: name, value });
    }
  }

  const missingCount =
    missingTables.length +
    missingColumns.length +
    missingEnums.length +
    missingEnumValues.length;

  return {
    ok: missingCount === 0,
    missingTables,
    missingColumns,
    missingEnums,
    missingEnumValues,
    missingCount,
  };
}

/** Rows come back as an array from postgres-js and as `{ rows }` elsewhere. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  return [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** What the database actually has, in the `public` schema. */
export async function readDatabaseSchema(db: SqlExecutor): Promise<ActualSchema> {
  const columnRows = rowsOf(
    await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `),
  );

  const enumRows = rowsOf(
    await db.execute(sql`
      select t.typname as enum_name, e.enumlabel as enum_value
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
    `),
  );

  const tables: Record<string, string[]> = {};
  for (const row of columnRows) {
    const table = text(row.table_name);
    const column = text(row.column_name);
    if (!table || !column) continue;
    (tables[table] ??= []).push(column);
  }

  const enums: Record<string, string[]> = {};
  for (const row of enumRows) {
    const name = text(row.enum_name);
    const value = text(row.enum_value);
    if (!name || value === null) continue;
    (enums[name] ??= []).push(value);
  }

  return { tables, enums };
}

/** The whole check: what the code expects vs. what the database has. */
export async function auditSchema(db: SqlExecutor): Promise<SchemaDrift> {
  return diffSchema(expectedSchema(), await readDatabaseSchema(db));
}

/**
 * One sentence, for a log line or a terminal. Written for the person who just
 * uploaded a package and has to decide whether a migration is still owed.
 */
export function driftSummary(drift: SchemaDrift): string {
  if (drift.ok) return 'Database schema matches the code.';

  const parts: string[] = [];
  if (drift.missingTables.length > 0) {
    parts.push(`missing tables: ${drift.missingTables.join(', ')}`);
  }
  if (drift.missingColumns.length > 0) {
    parts.push(
      `missing columns: ${drift.missingColumns
        .map(({ table, column }) => `${table}.${column}`)
        .join(', ')}`,
    );
  }
  if (drift.missingEnums.length > 0) {
    parts.push(`missing enum types: ${drift.missingEnums.join(', ')}`);
  }
  if (drift.missingEnumValues.length > 0) {
    parts.push(
      `missing enum values: ${drift.missingEnumValues
        .map(({ enum: name, value }) => `${name}.${value}`)
        .join(', ')}`,
    );
  }

  return `Database schema is behind the code — ${parts.join('; ')}. Run the pending migration.`;
}
