/**
 * Renders the ExamOS mark to PNGs: the one electron-builder turns into the
 * Windows .ico, the macOS .icns and the Linux icon, and the web-app icons the
 * manifest points at for a phone home screen. Written by hand so the build has
 * no image-tooling dependency.
 *
 * Running it with no arguments writes every target. `ICON_SIZE`, `ICON_OUT`
 * and `ICON_MASKABLE` render a single one instead. Targets live here rather
 * than in npm scripts because `VAR=value command` is not a thing on Windows,
 * and the desktop installer is built on a Windows runner.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCENT = [0x39, 0x49, 0xc9];
const WHITE = [0xff, 0xff, 0xff];

const TARGETS = [
  // The desktop icon. Committed, so packaging never depends on this script.
  { out: 'build/icon.png', size: 512 },
  { out: 'public/icons/icon-192.png', size: 192 },
  { out: 'public/icons/icon-512.png', size: 512 },
  // A maskable icon needs its art inside the safe zone, because the platform
  // is free to crop the corners into whatever shape it likes.
  { out: 'public/icons/icon-maskable.png', size: 512, maskable: true },
  { out: 'public/icons/apple-touch-icon.png', size: 180 },
];

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha),
  ];
}

function roundedRectAlpha(size, x, y, radius) {
  // Signed-distance coverage for a rounded square, antialiased at the edge.
  const half = size / 2;
  const cx = Math.abs(x - size / 2) - (half - radius);
  const cy = Math.abs(y - size / 2) - (half - radius);
  const dx = Math.max(cx, 0);
  const dy = Math.max(cy, 0);
  const distance = Math.hypot(dx, dy) + Math.min(Math.max(cx, cy), 0) - radius;
  return clamp(0.5 - distance);
}

function barAlpha(x, y, left, right, top, bottom, radius) {
  const cx = Math.abs(x - (left + right) / 2) - ((right - left) / 2 - radius);
  const cy = Math.abs(y - (top + bottom) / 2) - ((bottom - top) / 2 - radius);
  const dx = Math.max(cx, 0);
  const dy = Math.max(cy, 0);
  const distance = Math.hypot(dx, dy) + Math.min(Math.max(cx, cy), 0) - radius;
  return clamp(0.5 - distance);
}

/** Three ascending bars over a baseline — the readiness mark. */
function renderIcon(size, maskable) {
  // Maskable icons pull the art inward and fill the whole square; ordinary
  // ones use a rounded-square plate.
  const inset = maskable ? size * 0.1 : 0;
  const unit = (size - inset * 2) / 24;
  const bar = (l, r, t, b) => ({
    left: inset + l * unit,
    right: inset + r * unit,
    top: inset + t * unit,
    bottom: inset + b * unit,
  });
  const shapes = [
    bar(4.4, 7.2, 13.6, 18.4),
    bar(9.0, 11.8, 9.6, 18.4),
    bar(13.6, 16.4, 5.6, 18.4),
    bar(3.2, 20.8, 19.2, 20.6),
  ];

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0; // PNG filter type: none
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const bg = maskable ? 1 : roundedRectAlpha(size, x + 0.5, y + 0.5, size * 0.22);
      let mark = 0;
      for (const shape of shapes) {
        mark = Math.max(
          mark,
          barAlpha(x + 0.5, y + 0.5, shape.left, shape.right, shape.top, shape.bottom, unit * 0.55),
        );
      }
      const colour = mark > 0 ? blend(ACCENT, WHITE, mark) : ACCENT;

      raw[offset] = colour[0];
      raw[offset + 1] = colour[1];
      raw[offset + 2] = colour[2];
      raw[offset + 3] = Math.round(bg * 255);
      offset += 4;
    }
  }

  return encodePng(size, raw);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requested = process.env.ICON_OUT
  ? [
      {
        out: process.env.ICON_OUT,
        size: Number(process.env.ICON_SIZE ?? 512),
        maskable: process.env.ICON_MASKABLE === '1',
      },
    ]
  : TARGETS;

for (const target of requested) {
  const png = renderIcon(target.size, target.maskable === true);
  const file = join(root, target.out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, png);
  console.log(
    `[make-icon] ${target.out} (${target.size}x${target.size}, ${(png.length / 1024).toFixed(0)} KB)`,
  );
}
