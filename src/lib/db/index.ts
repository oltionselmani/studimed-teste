import 'server-only';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { SCHEMA_SQL } from './schema';
import { databaseFile, sqlWasmFile } from './paths';

/**
 * ExamOS stores everything in SQLite, executed through sql.js — a WebAssembly
 * build of SQLite proper. That keeps one code path across `next dev`, a
 * self-hosted server and the packaged desktop app, with no native rebuilds.
 *
 * The whole database is held in memory and flushed to disk after every write.
 * For a single-student workload (a few thousand rows) this is well within
 * budget, and the flush is atomic: write to a temp file, then rename.
 */

type Primitive = string | number | null | Uint8Array;

let engine: SqlJsStatic | null = null;
let handle: Database | null = null;
let ready: Promise<Database> | null = null;
let dirty = false;
let flushTimer: NodeJS.Timeout | null = null;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}

async function open(): Promise<Database> {
  if (handle) return handle;

  const wasmPath = sqlWasmFile();
  engine ??= await initSqlJs({
    // sql.js asks for the binary by name; hand it the resolved absolute path.
    locateFile: () => wasmPath,
    // sql.js's types declare ArrayBuffer; a Node Buffer's underlying buffer
    // is what the loader actually reads.
    wasmBinary: toArrayBuffer(readFileSync(wasmPath)),
  });

  const file = databaseFile();
  handle = existsSync(file)
    ? new engine.Database(new Uint8Array(readFileSync(file)))
    : new engine.Database();

  handle.run('PRAGMA foreign_keys = ON;');
  handle.run(SCHEMA_SQL);
  flushNow();
  return handle;
}

export function getDb(): Promise<Database> {
  ready ??= open().catch((error) => {
    // Let the next call retry rather than caching a failed bootstrap forever.
    ready = null;
    throw error;
  });
  return ready;
}

function flushNow() {
  if (!handle) return;
  const file = databaseFile();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, Buffer.from(handle.export()));
  renameSync(tmp, file);
  dirty = false;
}

/** Debounced persistence — a burst of writes costs one disk flush. */
function schedulePersist() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (dirty) flushNow();
  }, 120);
  // Do not keep a serverless/CLI process alive just for the flush timer.
  flushTimer.unref?.();
}

/** Forces any pending writes to disk. Call before the process may exit. */
export async function persist(): Promise<void> {
  await getDb();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (dirty) flushNow();
}

function bind(params: unknown[]): Primitive[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Uint8Array) return value;
    if (typeof value === 'number') return value;
    return String(value);
  });
}

/** Runs a statement that returns no rows. */
export async function run(sql: string, params: unknown[] = []): Promise<void> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(bind(params));
    stmt.step();
  } finally {
    stmt.free();
  }
  schedulePersist();
}

/** Runs a query and returns every matching row as a plain object. */
export async function all<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  const rows: T[] = [];
  try {
    stmt.bind(bind(params));
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
  } finally {
    stmt.free();
  }
  return rows;
}

/** Runs a query and returns the first row, or null. */
export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Executes `fn` inside a transaction. sql.js is synchronous and single
 * threaded, so a plain BEGIN/COMMIT pair is sufficient isolation here.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  db.run('BEGIN');
  try {
    const result = await fn();
    db.run('COMMIT');
    schedulePersist();
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
