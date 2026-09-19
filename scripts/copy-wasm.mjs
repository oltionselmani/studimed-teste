// Copies sql.js's WebAssembly binary into ./vendor so that the file is present
// in dev, in the Next.js standalone output, and inside the packaged desktop
// app — all of which resolve it from the process working directory.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const targetDir = join(root, 'vendor');
const target = join(targetDir, 'sql-wasm.wasm');

if (!existsSync(source)) {
  console.error('[copy-wasm] sql.js is not installed — run npm install first.');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log('[copy-wasm] vendor/sql-wasm.wasm ready');
