import { deflateSync } from 'node:zlib';

// Minimal, dependency-free PNG encoder producing small, genuinely decodable fixture images for
// Place-media e2e, accessibility, and visual specs use this generated image.
// No binary fixture files live in the repo; every
// spec that needs an image generates one in-test via buildFixturePng.

const crcTable = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

export interface FixtureRgb {
  r: number;
  g: number;
  b: number;
}

// Builds a solid-color, uncompressed-scanline truecolor PNG - valid enough for
// createImageBitmap/<canvas> to decode in a real browser, which the client-side dimension-read
// and downscale helpers require.
export function buildFixturePng(
  width: number,
  height: number,
  color: FixtureRgb = { r: 90, g: 140, b: 110 }
): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = pngChunk('IHDR', ihdrData);

  const rowBytes = width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const pixelStart = rowStart + 1 + x * 3;
      raw[pixelStart] = color.r;
      raw[pixelStart + 1] = color.g;
      raw[pixelStart + 2] = color.b;
    }
  }
  const idat = pngChunk('IDAT', deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

export function fixturePngFile(
  name: string,
  width = 40,
  height = 30,
  color?: FixtureRgb
): { name: string; mimeType: 'image/png'; buffer: Buffer } {
  return { name, mimeType: 'image/png', buffer: buildFixturePng(width, height, color) };
}
