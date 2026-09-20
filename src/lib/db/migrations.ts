import type { Database } from 'sql.js';

/**
 * Additive migrations for databases created by an earlier version.
 *
 * `CREATE TABLE IF NOT EXISTS` in the schema covers new tables, but it does
 * nothing for a new column on a table that already exists. Each entry here adds
 * one column if it is missing, so an existing student's data is upgraded in
 * place rather than being rebuilt.
 *
 * Every migration must be additive and safe to run repeatedly. Nothing here
 * drops or rewrites a column: a student's exam history is not something to
 * gamble with.
 */
interface ColumnMigration {
  table: string;
  column: string;
  /** The column definition, exactly as it appears in the schema. */
  definition: string;
}

/**
 * Held as JSON text so tooling that cannot import TypeScript — the demo seed
 * script — applies exactly this list rather than a second copy of it that can
 * drift out of step with this one.
 */
export const COLUMN_MIGRATIONS_JSON = `[
  {
    "table": "attempts",
    "column": "part_id",
    "definition": "TEXT REFERENCES exam_parts(id) ON DELETE SET NULL"
  }
]`;

const COLUMNS: ColumnMigration[] = JSON.parse(COLUMN_MIGRATIONS_JSON);

function columnExists(db: Database, table: string, column: string): boolean {
  const statement = db.prepare(`PRAGMA table_info(${table})`);
  try {
    while (statement.step()) {
      const row = statement.getAsObject() as { name?: unknown };
      if (row.name === column) return true;
    }
  } finally {
    statement.free();
  }
  return false;
}

function tableExists(db: Database, table: string): boolean {
  const statement = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  );
  try {
    statement.bind([table]);
    return statement.step();
  } finally {
    statement.free();
  }
}

export function runMigrations(db: Database): void {
  for (const migration of COLUMNS) {
    if (!tableExists(db, migration.table)) continue;
    if (columnExists(db, migration.table, migration.column)) continue;
    db.run(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`);
  }
}
