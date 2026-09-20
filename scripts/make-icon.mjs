/**
 * Renders the ExamOS mark to a PNG that electron-builder turns into the
 * Windows .ico, the macOS .icns and the Linux icon. Written by hand so the
 * build has no image-tooling dependency.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
const ACCENT = [0x39, 0x49, 0xc9];
const WHITE = [0xff, 0xff, 0xff];

function roundedRectAlpha(x, y, radius) {
  // Signed-distance coverage for a rounded square, antialiased at the edge.
  const inset = SIZE * 0.0;
  const half = SIZE / 2 - inset;
  const cx = Math.abs(x - SIZE / 2) - (half - radius);
  const cy = Math.abs(y - SIZE / 2) - (half - radius);
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

// Three ascending bars over a baseline — the readiness mark.
const unit = SIZE / 24;
const bars = [
  { left: 4.4 * unit, right: 7.2 * unit, top: 13.6 * unit, bottom: 18.4 * unit },
  { left: 9.0 * unit, right: 11.8 * unit, top: 9.6 * unit, bottom: 18.4 * unit },
  { left: 13.6 * unit, right: 16.4 * unit, top: 5.6 * unit, bottom: 18.4 * unit },
];
const baseline = { left: 3.2 * unit, right: 20.8 * unit, top: 19.2 * unit, bottom: 20.6 * unit };

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
let offset = 0;

for (let y = 0; y < SIZE; y += 1) {
  raw[offset] = 0; // PNG filter type: none
  offset += 1;
  for (let x = 0; x < SIZE; x += 1) {
    const bg = roundedRectAlpha(x + 0.5, y + 0.5, SIZE * 0.22);
    let colour = ACCENT;
    let mark = 0;
    for (const bar of [...bars, baseline]) {
      mark = Math.max(
        mark,
        barAlpha(x + 0.5, y + 0.5, bar.left, bar.right, bar.top, bar.bottom, unit * 0.55),
      );
    }
    if (mark > 0) colour = blend(ACCENT, WHITE, mark);

    raw[offset] = colour[0];
    raw[offset + 1] = colour[1];
    raw[offset + 2] = colour[2];
    raw[offset + 3] = Math.round(bg * 255);
    offset += 4;
  }
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
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

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = join(dirname(dirname(fileURLToPath(import.meta.url))), 'build', 'icon.png');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`[make-icon] ${target} (${SIZE}x${SIZE}, ${(png.length / 1024).toFixed(0)} KB)`);
