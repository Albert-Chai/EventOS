import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

/**
 * Generates the PWA app icons as a one-off, dependency-free step (mirrors the
 * seed's `floorplan-png` approach — no binary assets bundled in the repo, no
 * image library added just for a placeholder mark). Re-run with:
 *   node scripts/generate-pwa-icons.mjs
 *
 * The mark is a simple ring on the brand navy, full-bleed so it also works as a
 * maskable icon (the glyph stays within the safe zone).
 */

const BRAND = [15, 23, 42]; // #0f172a
const WHITE = [255, 255, 255];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, pixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)
  const raw = Buffer.alloc(size * (1 + size * 3));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function iconPixel(size) {
  const c = size / 2;
  return (x, y) => {
    const dx = x + 0.5 - c;
    const dy = y + 0.5 - c;
    const r = Math.sqrt(dx * dx + dy * dy) / size;
    if ((r >= 0.22 && r <= 0.34) || r < 0.1) return WHITE;
    return BRAND;
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/icons");
mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(resolve(outDir, `icon-${size}.png`), encodePng(size, iconPixel(size)));
}
writeFileSync(resolve(here, "../public/apple-touch-icon.png"), encodePng(180, iconPixel(180)));

console.log("Wrote public/icons/icon-192.png, icon-512.png, public/apple-touch-icon.png");
