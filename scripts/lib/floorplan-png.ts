import zlib from "node:zlib";

/**
 * A tiny dependency-free PNG encoder, used by the seed to generate a placeholder
 * floor plan and a merchant logo so the media pass (Storage + `files`) is
 * exercised end to end out of the box — without bundling binary assets.
 */

type RGB = [number, number, number];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, pixel: (x: number, y: number) => RGB): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
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

/** A light gridded "floor plan" with a border — enough to look real on the map. */
export function floorPlanPng(width = 1000, height = 700): Buffer {
  const bg: RGB = [241, 245, 249];
  const grid: RGB = [203, 213, 225];
  const border: RGB = [100, 116, 139];
  return encodePng(width, height, (x, y) => {
    if (x < 5 || y < 5 || x >= width - 5 || y >= height - 5) return border;
    if (x % 50 === 0 || y % 50 === 0) return grid;
    return bg;
  });
}

/** A solid square, used as a placeholder merchant logo. */
export function solidPng(size: number, color: RGB): Buffer {
  return encodePng(size, size, () => color);
}
