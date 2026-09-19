import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Where the database, uploaded materials and scans live.
 *
 * - Development / self-hosted: `./data` next to the project.
 * - Packaged desktop app: the OS application-data folder, injected by the
 *   Electron main process as EXAMOS_DATA_DIR.
 */
export function dataDir(): string {
  const configured = process.env.EXAMOS_DATA_DIR?.trim();
  const dir = configured && configured.length > 0 ? configured : path.join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function uploadsDir(): string {
  const dir = path.join(dataDir(), 'uploads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function databaseFile(): string {
  return path.join(dataDir(), 'examos.sqlite');
}

/**
 * sql.js ships its engine as a WebAssembly binary that has to be read from
 * disk. `scripts/copy-wasm.mjs` places a copy in ./vendor, which is included in
 * the standalone build and shipped as an extra resource in the desktop app.
 */
export function sqlWasmFile(): string {
  const candidates = [
    process.env.EXAMOS_SQL_WASM,
    path.join(process.cwd(), 'vendor', 'sql-wasm.wasm'),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(os.homedir(), '.examos', 'sql-wasm.wasm'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'sql-wasm.wasm was not found. Run `node scripts/copy-wasm.mjs` or set EXAMOS_SQL_WASM.',
  );
}
