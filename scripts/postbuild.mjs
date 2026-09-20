// Next's `standalone` output deliberately omits static assets so that a CDN can
// serve them. ExamOS ships as one self-contained server (and inside the desktop
// app), so they are copied in here.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.error('[postbuild] .next/standalone is missing — run next build first.');
  process.exit(1);
}

const staticSource = join(root, '.next', 'static');
if (existsSync(staticSource)) {
  const target = join(standalone, '.next', 'static');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(staticSource, target, { recursive: true });
}

const publicSource = join(root, 'public');
if (existsSync(publicSource)) {
  cpSync(publicSource, join(standalone, 'public'), { recursive: true });
}

// The SQLite engine binary, resolved from the working directory at runtime.
const wasm = join(root, 'vendor', 'sql-wasm.wasm');
if (existsSync(wasm)) {
  mkdirSync(join(standalone, 'vendor'), { recursive: true });
  cpSync(wasm, join(standalone, 'vendor', 'sql-wasm.wasm'));
}

// A database can end up here if the server was ever run with this directory
// as its working directory. It must never reach an installer.
for (const stray of ['data', '.test-data']) {
  rmSync(join(standalone, stray), { recursive: true, force: true });
}

console.log('[postbuild] standalone bundle completed');
