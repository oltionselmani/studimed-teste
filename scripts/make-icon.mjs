/**
 * Renders the ExamOS logo to every size the product needs: the PNG
 * electron-builder turns into the Windows .ico, the macOS .icns and the Linux
 * icon, the web-app icons the manifest points at for a phone home screen, and
 * the small mark the interface shows in its header.
 *
 * The one source of truth is build/logo-source.png. Nothing here draws the
 * logo — it is resized, never redrawn — so changing the artwork means
 * replacing that one file and running `npm run icons`.
 *
 * Running with no arguments writes every target. ICON_SIZE and ICON_OUT render
 * a single one instead. Targets live here rather than in npm scripts because
 * `VAR=value command` is not a thing on Windows, and the desktop installer is
 * built on a Windows runner.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(root, 'build', 'logo-source.png');

/** The logo's own background, used to pad the maskable variant. */
const BACKGROUND = { r: 4, g: 9, b: 46, alpha: 1 };

const TARGETS = [
  // The desktop icon. Committed, so packaging never depends on this script.
  { out: 'build/icon.png', size: 512 },
  { out: 'public/icons/icon-192.png', size: 192 },
  { out: 'public/icons/icon-512.png', size: 512 },
  // A maskable icon may be cropped into whatever shape the platform likes, so
  // the artwork is pulled inside the safe zone and the rest is filled.
  { out: 'public/icons/icon-maskable.png', size: 512, safeZone: true },
  { out: 'public/icons/apple-touch-icon.png', size: 180 },
  // Shown in the app's own header and on the sign-in screen.
  { out: 'public/icons/logo.png', size: 128 },
  // Sits next to splash.html so the desktop splash references it without
  // reaching across directories inside the packaged asar archive.
  { out: 'electron/splash-icon.png', size: 256 },
];

async function render({ out, size, safeZone }) {
  const file = join(root, out);
  mkdirSync(dirname(file), { recursive: true });

  if (safeZone) {
    // 80% of the square is the circle a maskable icon is guaranteed to keep.
    const inner = Math.round(size * 0.8);
    const pad = Math.round((size - inner) / 2);
    const art = await sharp(SOURCE).resize(inner, inner, { fit: 'cover' }).toBuffer();
    await sharp(art)
      .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: BACKGROUND })
      .png({ compressionLevel: 9 })
      .toFile(file);
  } else {
    await sharp(SOURCE).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(file);
  }

  return file;
}

const requested = process.env.ICON_OUT
  ? [{ out: process.env.ICON_OUT, size: Number(process.env.ICON_SIZE ?? 512), safeZone: process.env.ICON_MASKABLE === '1' }]
  : TARGETS;

for (const target of requested) {
  await render(target);
  console.log(`[make-icon] ${target.out} (${target.size}x${target.size})`);
}
