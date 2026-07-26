import { describe, expect, it } from 'vitest';

import { inspectImage, stripImageMetadata } from '$server/place-media/strip-image-metadata';

import { bytesOf, gpsMarker, indexOfSequence } from '../unit/place-media/image-fixtures';

/**
 * The stripper's output has to decode.
 *
 * The unit suite proves the structure: the metadata is gone, the pixels are byte-identical, the
 * lengths and CRCs add up. None of that is a decoder. A file can satisfy every structural
 * assertion in this repository and still be refused by the one thing that matters - a browser
 * asked to show it - and a Member whose photo is approved into a broken file has been failed
 * quietly by us rather than loudly by their camera.
 *
 * So these fixtures are encoded by the browser itself (canvas, real compressors), given real
 * metadata, put through the real stripper, and handed back to the browser to decode.
 */

const widthPx = 48;
const heightPx = 32;

async function encodeCanvas(mimeType: string): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser refused a 2d canvas context');
  context.fillStyle = '#2f6f5e';
  context.fillRect(0, 0, widthPx, heightPx);
  context.fillStyle = '#f2c14e';
  context.fillRect(4, 4, 16, 12);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType));
  if (!blob || blob.type !== mimeType) throw new Error(`This browser cannot encode ${mimeType}`);
  return new Uint8Array(await blob.arrayBuffer());
}

/** "Exif\0\0" plus a little-endian TIFF block whose one ASCII entry holds the location. */
function exifPayload(): number[] {
  const description = [...bytesOf(gpsMarker), 0x00];
  return [
    ...bytesOf('Exif'),
    0x00,
    0x00,
    ...bytesOf('II'),
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x0e,
    0x01,
    0x02,
    0x00,
    ...uint32LE(description.length),
    ...uint32LE(26),
    0x00,
    0x00,
    0x00,
    0x00,
    ...description
  ];
}

function uint32LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function crc32(bytes: readonly number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: readonly number[]): number[] {
  const typed = [...bytesOf(type), ...data];
  return [...uint32BE(data.length), ...typed, ...uint32BE(crc32(typed))];
}

/** An APP1 EXIF segment and a COM comment, spliced in behind the start-of-image marker. */
function jpegWithMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const payload = exifPayload();
  const comment = bytesOf(`Photographed at ${gpsMarker}`);
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    ...[(payload.length + 2) >> 8, (payload.length + 2) & 0xff],
    ...payload,
    0xff,
    0xfe,
    ...[(comment.length + 2) >> 8, (comment.length + 2) & 0xff],
    ...comment,
    ...bytes.subarray(2)
  ]);
}

/** A tEXt and an eXIf chunk, spliced in behind IHDR. */
function pngWithMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const headerEnd = 8 + 8 + 13 + 4;
  return Uint8Array.from([
    ...bytes.subarray(0, headerEnd),
    ...pngChunk('tEXt', [...bytesOf('Comment'), 0x00, ...bytesOf(gpsMarker)]),
    ...pngChunk('eXIf', exifPayload().slice(6)),
    ...bytes.subarray(headerEnd)
  ]);
}

/**
 * This browser already emits the extended form (a VP8X chunk leading the file), which is where
 * EXIF is allowed to live, so the fixture raises the EXIF flag on the chunk that is there and
 * appends the block - exactly what a camera writes.
 */
function webpWithMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const leadingChunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (leadingChunk !== 'VP8X') {
    throw new Error(`Expected an extended WebP from this browser, found ${leadingChunk}`);
  }

  const exif = exifPayload().slice(6);
  const padded = exif.length % 2 === 1 ? [...exif, 0x00] : exif;
  const withExif = Uint8Array.from([
    ...bytes,
    ...bytesOf('EXIF'),
    ...uint32LE(exif.length),
    ...padded
  ]);
  // The EXIF flag on VP8X, whose payload starts eight bytes into the chunk at offset 12.
  withExif[20] = withExif[20]! | 0x08;
  const riffSize = withExif.length - 8;
  withExif.set(uint32LE(riffSize), 4);
  return withExif;
}

const containers = [
  { mimeType: 'image/jpeg' as const, withMetadata: jpegWithMetadata },
  { mimeType: 'image/png' as const, withMetadata: pngWithMetadata },
  { mimeType: 'image/webp' as const, withMetadata: webpWithMetadata }
];

describe('a stripped photo is still a photo', () => {
  it.each(containers)('decodes after the strip: $mimeType', async ({ mimeType, withMetadata }) => {
    const encoded = await encodeCanvas(mimeType);
    const carrying = withMetadata(encoded);

    // The fixture has to be a real, decodable file carrying real metadata, or the assertion
    // below would be proving nothing about the strip.
    expect(indexOfSequence(carrying, bytesOf(gpsMarker))).toBeGreaterThan(0);
    const before = await createImageBitmap(new Blob([carrying], { type: mimeType }));
    expect([before.width, before.height]).toEqual([widthPx, heightPx]);

    const stripped = stripImageMetadata(carrying, mimeType);
    expect(stripped.ok).toBe(true);
    if (!stripped.ok) return;

    expect(indexOfSequence(stripped.bytes, bytesOf(gpsMarker))).toBe(-1);
    expect(inspectImage(stripped.bytes)).toEqual({
      ok: true,
      value: { container: mimeType, widthPx, heightPx }
    });

    const after = await createImageBitmap(new Blob([stripped.bytes], { type: mimeType }));
    expect([after.width, after.height]).toEqual([widthPx, heightPx]);
  });
});
