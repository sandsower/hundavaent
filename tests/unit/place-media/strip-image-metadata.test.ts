import { describe, expect, it } from 'vitest';

import {
  inspectImage,
  sniffContainer,
  stripImageMetadata
} from '$server/place-media/strip-image-metadata';

import {
  buildJpeg,
  buildPng,
  buildWebp,
  bytesOf,
  containsSequence,
  gpsMarker,
  indexOfSequence,
  jpegScanBytes,
  pngIdatBytes
} from './image-fixtures';

const gpsBytes = bytesOf(gpsMarker);

function stripped(bytes: Uint8Array, container: 'image/jpeg' | 'image/png' | 'image/webp') {
  const result = stripImageMetadata(bytes, container);
  if (!result.ok) throw new Error(`expected a stripped image, got ${result.error}`);
  return result.bytes;
}

describe('container sniffing', () => {
  it('reads the container from the leading bytes, not from a declared type', () => {
    expect(sniffContainer(buildJpeg())).toBe('image/jpeg');
    expect(sniffContainer(buildPng())).toBe('image/png');
    expect(sniffContainer(buildWebp())).toBe('image/webp');
  });

  it('refuses a container this app does not publish', () => {
    const gif = Uint8Array.from(bytesOf('GIF89a'));
    expect(sniffContainer(gif)).toBeNull();
    expect(inspectImage(gif)).toEqual({ ok: false, error: 'unsupported' });
  });

  it('refuses a file whose extension lies about its bytes', () => {
    // The archetypal mismatch: a PDF renamed to .jpg and declared as image/jpeg.
    const pdf = Uint8Array.from(bytesOf('%PDF-1.7\n%\xe2\xe3\xcf\xd3'));
    expect(inspectImage(pdf)).toEqual({ ok: false, error: 'unsupported' });
  });

  it('refuses a RIFF container that is not WebP', () => {
    const wav = Uint8Array.from([...bytesOf('RIFF'), 0x24, 0, 0, 0, ...bytesOf('WAVEfmt ')]);
    expect(sniffContainer(wav)).toBeNull();
  });

  it('refuses an empty file and a file shorter than any signature', () => {
    expect(sniffContainer(new Uint8Array())).toBeNull();
    expect(sniffContainer(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('JPEG metadata removal', () => {
  it('reads dimensions from the frame header of a baseline image', () => {
    expect(inspectImage(buildJpeg({ widthPx: 1024, heightPx: 768 }))).toEqual({
      ok: true,
      value: { container: 'image/jpeg', widthPx: 1024, heightPx: 768 }
    });
  });

  it('reads dimensions from the frame header of a progressive image', () => {
    expect(inspectImage(buildJpeg({ frameMarker: 0xc2, widthPx: 90, heightPx: 160 }))).toEqual({
      ok: true,
      value: { container: 'image/jpeg', widthPx: 90, heightPx: 160 }
    });
  });

  it('leaves no trace of EXIF, XMP or the comment', () => {
    const source = buildJpeg();
    expect(containsSequence(source, gpsBytes)).toBe(true);

    const output = stripped(source, 'image/jpeg');
    expect(containsSequence(output, gpsBytes)).toBe(false);
    expect(containsSequence(output, bytesOf('Exif'))).toBe(false);
    expect(containsSequence(output, bytesOf('http://ns.adobe.com/xap/1.0/'))).toBe(false);
  });

  it('keeps the JFIF segment, which carries rendering bookkeeping and no provenance', () => {
    expect(containsSequence(stripped(buildJpeg(), 'image/jpeg'), bytesOf('JFIF'))).toBe(true);
  });

  it('copies the entropy-coded scan through byte for byte', () => {
    const output = stripped(buildJpeg(), 'image/jpeg');
    expect(indexOfSequence(output, jpegScanBytes)).toBeGreaterThan(0);
  });

  it('drops everything after the end-of-image marker', () => {
    const output = stripped(buildJpeg({ withTrailingData: true }), 'image/jpeg');
    expect(output[output.length - 2]).toBe(0xff);
    expect(output[output.length - 1]).toBe(0xd9);
  });

  it('parses back with identical dimensions', () => {
    const source = buildJpeg({ widthPx: 800, heightPx: 600 });
    expect(inspectImage(stripped(source, 'image/jpeg'))).toEqual(inspectImage(source));
  });

  it('carries the orientation across, because a browser rotates from it', () => {
    // A phone shooting in portrait stores landscape pixels and Orientation 6. Losing the tag and
    // not rotating the pixels would leave every portrait photo lying on its side.
    const output = stripped(buildJpeg({ orientation: 6 }), 'image/jpeg');
    const exifAt = indexOfSequence(output, bytesOf('Exif'));

    expect(exifAt).toBeGreaterThan(0);
    expect(containsSequence(output, gpsBytes)).toBe(false);
    // The whole APP1 is a marker, a length of 34, and 32 bytes holding one entry and the value 6.
    expect([...output.slice(exifAt - 4, exifAt)]).toEqual([0xff, 0xe1, 0x00, 0x22]);
    expect([...output.slice(exifAt, exifAt + 32)]).toEqual([
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
      0x12,
      0x01,
      0x03,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x06,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]);
  });

  it('emits nothing for the orientation a decoder already assumes', () => {
    const output = stripped(buildJpeg({ orientation: 1 }), 'image/jpeg');
    expect(containsSequence(output, bytesOf('Exif'))).toBe(false);
  });

  it('parses back with identical dimensions once the orientation is re-emitted', () => {
    const source = buildJpeg({ orientation: 8, widthPx: 480, heightPx: 640 });
    expect(inspectImage(stripped(source, 'image/jpeg'))).toEqual({
      ok: true,
      value: { container: 'image/jpeg', widthPx: 480, heightPx: 640 }
    });
  });

  it('reads the orientation out of a big-endian EXIF block too', () => {
    const source = buildJpeg({ orientation: 3 });
    // Flip the byte-order mark and every multi-byte field the reader touches.
    const tiffAt = indexOfSequence(source, bytesOf('Exif')) + 6;
    source.set(bytesOf('MM'), tiffAt);
    source.set([0x00, 0x2a], tiffAt + 2);
    source.set([0x00, 0x00, 0x00, 0x08], tiffAt + 4);
    source.set([0x00, 0x02], tiffAt + 8);
    source.set([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x03], tiffAt + 10);

    const output = stripped(source, 'image/jpeg');
    const exifAt = indexOfSequence(output, bytesOf('Exif'));
    expect(exifAt).toBeGreaterThan(0);
    expect(output[exifAt + 24]).toBe(0x03);
  });

  it('carries no orientation across from an entry that is not a single SHORT', () => {
    // Type 4 is LONG. Its value occupies all four bytes of the value field rather than the first
    // two, so reading a SHORT out of it would carry across a number that means nothing.
    const source = buildJpeg({ orientation: 6, orientationType: 4 });
    const output = stripped(source, 'image/jpeg');

    expect(containsSequence(output, bytesOf('Exif'))).toBe(false);
    expect(containsSequence(output, gpsBytes)).toBe(false);
    expect(inspectImage(output)).toEqual(inspectImage(source));
  });

  it('is a no-op on an image that carries no metadata', () => {
    const clean = buildJpeg({
      withExif: false,
      withComment: false,
      withXmp: false,
      withTrailingData: false
    });
    expect([...stripped(clean, 'image/jpeg')]).toEqual([...clean]);
  });

  it('refuses a truncated image rather than repairing it', () => {
    const truncated = buildJpeg().slice(0, 40);
    expect(stripImageMetadata(truncated, 'image/jpeg')).toEqual({ ok: false, error: 'malformed' });
    expect(inspectImage(truncated)).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses an image whose segment length runs past the end of the file', () => {
    const broken = buildJpeg();
    // The APP0 length field, made longer than the remaining file.
    broken[4] = 0xff;
    broken[5] = 0xf0;
    expect(stripImageMetadata(broken, 'image/jpeg')).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses an image that never reaches the end-of-image marker', () => {
    const source = buildJpeg({ withTrailingData: false });
    const withoutEoi = source.slice(0, source.length - 2);
    expect(stripImageMetadata(withoutEoi, 'image/jpeg')).toEqual({ ok: false, error: 'malformed' });
  });
});

describe('PNG metadata removal', () => {
  it('reads dimensions from IHDR', () => {
    expect(inspectImage(buildPng({ widthPx: 512, heightPx: 384 }))).toEqual({
      ok: true,
      value: { container: 'image/png', widthPx: 512, heightPx: 384 }
    });
  });

  it('leaves no trace of the text, XMP or EXIF chunks', () => {
    const source = buildPng();
    expect(containsSequence(source, gpsBytes)).toBe(true);

    const output = stripped(source, 'image/png');
    expect(containsSequence(output, gpsBytes)).toBe(false);
    expect(containsSequence(output, bytesOf('tEXt'))).toBe(false);
    expect(containsSequence(output, bytesOf('iTXt'))).toBe(false);
    expect(containsSequence(output, bytesOf('eXIf'))).toBe(false);
    expect(containsSequence(output, bytesOf('tIME'))).toBe(false);
  });

  it('keeps the critical chunks and the rendering ancillaries', () => {
    const output = stripped(buildPng(), 'image/png');
    expect(containsSequence(output, bytesOf('IHDR'))).toBe(true);
    expect(containsSequence(output, bytesOf('pHYs'))).toBe(true);
    expect(containsSequence(output, bytesOf('IDAT'))).toBe(true);
    expect(containsSequence(output, bytesOf('IEND'))).toBe(true);
  });

  it('copies the compressed pixel data through byte for byte', () => {
    expect(indexOfSequence(stripped(buildPng(), 'image/png'), pngIdatBytes)).toBeGreaterThan(0);
  });

  it('parses back with identical dimensions', () => {
    const source = buildPng({ widthPx: 64, heightPx: 48 });
    expect(inspectImage(stripped(source, 'image/png'))).toEqual(inspectImage(source));
  });

  it('drops an ancillary chunk under a type the allowlist does not know', () => {
    const source = buildPng({ withUnknownChunk: true });
    expect(containsSequence(source, bytesOf('prVt'))).toBe(true);

    const output = stripped(source, 'image/png');
    expect(containsSequence(output, bytesOf('prVt'))).toBe(false);
    expect(containsSequence(output, gpsBytes)).toBe(false);
    expect(containsSequence(output, bytesOf('IDAT'))).toBe(true);
  });

  it('drops the animation control chunk, leaving the first frame', () => {
    const source = buildPng({ withAnimation: true });
    expect(containsSequence(source, bytesOf('acTL'))).toBe(true);

    const output = stripped(source, 'image/png');
    expect(containsSequence(output, bytesOf('acTL'))).toBe(false);
    expect(inspectImage(output)).toEqual(inspectImage(source));
  });

  it('is a no-op on an image that carries no metadata', () => {
    const clean = buildPng({ withText: false, withExif: false, withTime: false });
    expect([...stripped(clean, 'image/png')]).toEqual([...clean]);
  });

  it('refuses a chunk length that runs past the end of the file', () => {
    const broken = buildPng();
    broken[8] = 0x7f;
    expect(stripImageMetadata(broken, 'image/png')).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses a file that never reaches IEND', () => {
    const source = buildPng();
    const withoutEnd = source.slice(0, source.length - 12);
    expect(stripImageMetadata(withoutEnd, 'image/png')).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses a file that does not lead with IHDR', () => {
    const broken = buildPng();
    broken.set(bytesOf('IHDX'), 12);
    expect(stripImageMetadata(broken, 'image/png')).toEqual({ ok: false, error: 'malformed' });
  });
});

describe('WebP metadata removal', () => {
  it('reads dimensions from the extended-format canvas header', () => {
    expect(inspectImage(buildWebp({ widthPx: 1600, heightPx: 900 }))).toEqual({
      ok: true,
      value: { container: 'image/webp', widthPx: 1600, heightPx: 900 }
    });
  });

  it('reads dimensions from a simple lossless image', () => {
    expect(inspectImage(buildWebp({ extended: false, widthPx: 300, heightPx: 200 }))).toEqual({
      ok: true,
      value: { container: 'image/webp', widthPx: 300, heightPx: 200 }
    });
  });

  it('reads dimensions from a simple lossy image', () => {
    expect(
      inspectImage(buildWebp({ extended: false, lossless: false, widthPx: 640, heightPx: 360 }))
    ).toEqual({ ok: true, value: { container: 'image/webp', widthPx: 640, heightPx: 360 } });
  });

  it('leaves no trace of the EXIF or XMP chunks', () => {
    const source = buildWebp();
    expect(containsSequence(source, gpsBytes)).toBe(true);

    const output = stripped(source, 'image/webp');
    expect(containsSequence(output, gpsBytes)).toBe(false);
    expect(containsSequence(output, bytesOf('EXIF'))).toBe(false);
    expect(containsSequence(output, bytesOf('XMP '))).toBe(false);
  });

  it('clears the EXIF and XMP flags so no reader goes looking for what is gone', () => {
    const output = stripped(buildWebp(), 'image/webp');
    const vp8xAt = indexOfSequence(output, bytesOf('VP8X'));
    expect(vp8xAt).toBeGreaterThan(0);
    // ICC survives, EXIF and XMP do not.
    expect(output[vp8xAt + 8]).toBe(0x20);
  });

  it('keeps the image chunk and the colour profile', () => {
    const output = stripped(buildWebp(), 'image/webp');
    expect(containsSequence(output, bytesOf('VP8L'))).toBe(true);
    expect(containsSequence(output, bytesOf('ICCP'))).toBe(true);
  });

  it('rewrites the RIFF size to match the file it actually produced', () => {
    const output = stripped(buildWebp(), 'image/webp');
    const declared =
      output[4]! | (output[5]! << 8) | (output[6]! << 16) | ((output[7]! << 24) >>> 0);
    expect(declared).toBe(output.byteLength - 8);
  });

  it('parses back with identical dimensions', () => {
    const source = buildWebp({ widthPx: 1024, heightPx: 512 });
    expect(inspectImage(stripped(source, 'image/webp'))).toEqual(inspectImage(source));
  });

  it('is a no-op on a simple image that carries no metadata', () => {
    const clean = buildWebp({ extended: false });
    expect([...stripped(clean, 'image/webp')]).toEqual([...clean]);
  });

  it('refuses a container holding no image data at all', () => {
    const metadataOnly = buildWebp();
    const output = stripImageMetadata(metadataOnly, 'image/webp');
    expect(output.ok).toBe(true);

    const bodyless = Uint8Array.from([
      ...bytesOf('RIFF'),
      0x0c,
      0x00,
      0x00,
      0x00,
      ...bytesOf('WEBP'),
      ...bytesOf('EXIF'),
      0x00,
      0x00,
      0x00,
      0x00
    ]);
    expect(stripImageMetadata(bodyless, 'image/webp')).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses a chunk length that runs past the end of the file', () => {
    const broken = buildWebp();
    broken[16] = 0xff;
    broken[17] = 0xff;
    expect(stripImageMetadata(broken, 'image/webp')).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses a chunk whose pad byte is not in the file', () => {
    // An odd-length chunk owes a pad byte, and RIFF counts it. A file that stops on the odd byte
    // is one chunk short of what it claims, and reading through it would run past the payload.
    const littleEndian = (value: number): number[] => [
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff
    ];
    const body = [
      ...bytesOf('WEBP'),
      ...bytesOf('VP8L'),
      ...littleEndian(8),
      0x2f,
      0x00,
      0x00,
      0x00,
      0x00,
      0x11,
      0x22,
      0x33,
      ...bytesOf('ODDC'),
      ...littleEndian(3),
      0x01,
      0x02,
      0x03
    ];
    const unpadded = Uint8Array.from([...bytesOf('RIFF'), ...littleEndian(body.length), ...body]);

    expect(stripImageMetadata(unpadded, 'image/webp')).toEqual({ ok: false, error: 'malformed' });
    expect(inspectImage(unpadded)).toEqual({ ok: false, error: 'malformed' });
  });

  it('refuses a truncated container', () => {
    expect(stripImageMetadata(buildWebp().slice(0, 10), 'image/webp')).toEqual({
      ok: false,
      error: 'malformed'
    });
  });
});
