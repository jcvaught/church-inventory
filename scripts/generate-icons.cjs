#!/usr/bin/env node
// Generates icon-192.png and icon-512.png in public/ using only Node built-ins.
// Colors match the favicon SVG: navy #1B2A4A background, teal #2A7D6E circle.
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

// ── PNG builder ────────────────────────────────────────────────────────────
function makePNG(size) {
  const SIG  = Buffer.from([137,80,78,71,13,10,26,10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  // Draw pixels: FULL-BLEED navy background + teal ring.
  // Audit L7: the icon is declared "any maskable" — a maskable icon must have
  // its background bleed to every edge (any mask shape shows solid colour, no
  // off-white slivers / cropped corners) and keep all logo content inside the
  // central 80% "safe zone". The navy fills every pixel; the teal ring's outer
  // radius (~0.353·size from centre) sits well inside the 0.4·size safe zone.
  const cx = size / 2, cy = size / 2;
  const ringR = size * 0.31, ringW = size * 0.086;

  const pixels = Buffer.alloc(size * size * 3);
  const [nR,nG,nB] = [0x1B,0x2A,0x4A]; // navy
  const [tR,tG,tB] = [0x2A,0x7D,0x6E]; // teal

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;

      // teal ring (arc on left side of icon)
      const dist = Math.hypot(x - cx * 1.05, y - cy);
      if (dist >= ringR - ringW/2 && dist <= ringR + ringW/2 && x < cx + ringR * 0.6) {
        pixels[idx]=tR; pixels[idx+1]=tG; pixels[idx+2]=tB;
      } else {
        pixels[idx]=nR; pixels[idx+1]=nG; pixels[idx+2]=nB;
      }
    }
  }

  // Build raw rows (filter byte 0 = None per row)
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]));
    rows.push(pixels.slice(y * size * 3, (y + 1) * size * 3));
  }
  const idat = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public');
for (const size of [192, 512]) {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, makePNG(size));
  console.log(`✓ ${file}`);
}
