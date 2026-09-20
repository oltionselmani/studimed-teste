// The engine is written for a bundler, so its relative imports carry no file
// extension. Node's ESM loader requires them, so they are added here after the
// unit-test build. Nothing in the shipped application goes through this path.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), '.test-build');

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');
      const fixed = source.replace(
        /(\bfrom\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
        (match, prefix, path, suffix) =>
          path.endsWith('.js') ? match : `${prefix}${path}.js${suffix}`,
      );
      if (fixed !== source) writeFileSync(full, fixed);
    }
  }
}

walk(root);
console.log('[fix-test-imports] done');
