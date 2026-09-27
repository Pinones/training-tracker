// Generates the PWA / Apple icons as PNGs using only Node built-ins.
// Placeholder artwork (a barbell); replaced with a designed icon in Phase 7.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0f, 0x17, 0x2a];
const FG = [0x34, 0xd3, 0x99];

// Shapes in unit coordinates (0..1) for a full-bleed icon, scaled by `pad` for maskable.
const rects = [
  [0.2, 0.47, 0.8, 0.53], // bar
  [0.26, 0.32, 0.33, 0.68], // inner plate L
  [0.67, 0.32, 0.74, 0.68], // inner plate R
  [0.18, 0.38, 0.25, 0.62], // outer plate L
  [0.75, 0.38, 0.82, 0.62], // outer plate R
];

function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, scale) {
  const off = (1 - scale) / 2;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size - off) / scale;
      const v = ((y + 0.5) / size - off) / scale;
      const hit = rects.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1);
      const [r, g, b] = hit ? FG : BG;
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/pwa-192x192.png', png(192, 1));
writeFileSync('public/pwa-512x512.png', png(512, 1));
writeFileSync('public/maskable-512x512.png', png(512, 0.8)); // keep art in the safe zone
writeFileSync('public/apple-touch-icon.png', png(180, 0.9));

const svgRects = rects
  .map(([x0, y0, x1, y1]) => `<rect x="${x0 * 64}" y="${y0 * 64}" width="${(x1 - x0) * 64}" height="${(y1 - y0) * 64}"/>`)
  .join('');
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f172a"/><g fill="#34d399">${svgRects}</g></svg>\n`,
);
console.log('Icons written to public/');
