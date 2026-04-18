import { writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// Emit a minimal 256×256 PNG under build/icons so electron-builder has
// something to convert into an ICO when packaging. This is a placeholder —
// swap in the real brand mark before shipping v1 publicly.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'build', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const SIZE = 256;
const BG = [0x0b, 0x0d, 0x10]; // match app background.
const FG = [0xf0, 0xa0, 0x20]; // warm amber "L".

// Build raw RGBA rows. Rough L-mark — just enough to be recognisable.
const rows = [];
for (let y = 0; y < SIZE; y += 1) {
  const row = [0x00]; // filter byte per PNG spec
  for (let x = 0; x < SIZE; x += 1) {
    const onStroke =
      (x > 64 && x < 96 && y > 48 && y < 208) || (x > 64 && x < 192 && y > 176 && y < 208);
    const [r, g, b] = onStroke ? FG : BG;
    row.push(r, g, b, 0xff);
  }
  rows.push(Buffer.from(row));
}
const raw = Buffer.concat(rows);
const compressed = deflateSync(raw);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  // CRC-32 over type + data
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) {
    crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const pngPath = path.resolve(OUT_DIR, 'icon.png');
writeFileSync(pngPath, png);
console.log(`wrote ${pngPath} (${png.length} bytes)`);
