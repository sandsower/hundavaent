/**
 * Container-level metadata removal for the three image types this app accepts.
 *
 * A photo taken on a phone carries EXIF, and EXIF carries GPS. An approved photo is served to
 * anonymous callers verbatim, so publishing one unstripped would publish wherever its uploader was
 * standing. Moderators review pixels, not byte ranges, so nothing downstream would catch it.
 *
 * Everything here is byte-level container surgery with no dependency, and it is deliberately
 * conservative: compressed image data is never re-encoded, and anything that does not parse is
 * refused rather than repaired. The pixels that come out are the pixels that went in.
 *
 * The posture is uniform across the two chunked containers: PNG and WebP both keep an allowlist of
 * chunks a decoder needs and drop everything else. A denylist can only remove the metadata someone
 * thought of, and a registry that grows - or a private chunk under a name nobody has seen - would
 * be copied straight through into a file served to anonymous readers. JPEG cannot be expressed that
 * way, because its scan is not a named segment, so it drops the marker range that carries metadata
 * and keeps the rest.
 *
 * Neither container publishes animation. WebP animation is refused outright (the strip requires a
 * top-level VP8 or VP8L image chunk, which an animated file does not have), and an animated PNG
 * comes out as its first frame. A Member is offering a photograph of a Place, and a moving image
 * approved on the strength of one reviewed frame is a surprise nobody signed off on.
 *
 * One value is deliberately carried across rather than dropped: JPEG EXIF Orientation, which is
 * how a browser knows to rotate a portrait phone photo. It is re-emitted as a freshly built
 * segment holding that integer and nothing else - see readJpegOrientation.
 */

export type ImageContainer = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInspection {
  container: ImageContainer;
  widthPx: number;
  heightPx: number;
}

export type ImageInspectionResult =
  { ok: true; value: ImageInspection } | { ok: false; error: 'unsupported' | 'malformed' };

export type StripResult =
  { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: 'malformed' };

const jpegSignature = [0xff, 0xd8, 0xff];
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The real container, read from the leading bytes, plus the pixel dimensions read from the
 * container's own header. A declared content type is a claim by the caller; this is the file.
 */
export function inspectImage(bytes: Uint8Array): ImageInspectionResult {
  const container = sniffContainer(bytes);
  if (!container) return { ok: false, error: 'unsupported' };

  const dimensions =
    container === 'image/jpeg'
      ? readJpegDimensions(bytes)
      : container === 'image/png'
        ? readPngDimensions(bytes)
        : readWebpDimensions(bytes);

  if (!dimensions) return { ok: false, error: 'malformed' };
  return { ok: true, value: { container, ...dimensions } };
}

export function sniffContainer(bytes: Uint8Array): ImageContainer | null {
  if (startsWith(bytes, jpegSignature)) return 'image/jpeg';
  if (startsWith(bytes, pngSignature)) return 'image/png';
  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function stripImageMetadata(bytes: Uint8Array, container: ImageContainer): StripResult {
  switch (container) {
    case 'image/jpeg':
      return stripJpegMetadata(bytes);
    case 'image/png':
      return stripPngMetadata(bytes);
    case 'image/webp':
      return stripWebpMetadata(bytes);
  }
}

// --- JPEG ---------------------------------------------------------------------------------------
//
// A JPEG is SOI, a run of marker segments, and an entropy-coded scan. APP1 holds EXIF (and so
// GPS) and XMP, APP2 holds ICC and MPF, APP13 holds IPTC and Photoshop resources, and COM holds
// free text. APP0 is JFIF - density and thumbnail bookkeeping a decoder reads, with no capture
// provenance in it - so it stays.
//
// The scan is copied byte for byte. A byte 0xFF inside entropy-coded data is stuffed as 0xFF 0x00
// and restart markers appear inline, so the scan ends only at a marker that is neither of those.

const jpegStandaloneMarkers = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

function isJpegMetadataMarker(marker: number): boolean {
  return (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
}

function isJpegFrameHeader(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 && // DHT
    marker !== 0xc8 && // JPG, reserved
    marker !== 0xcc // DAC
  );
}

interface JpegSegment {
  marker: number;
  start: number;
  end: number;
  payloadStart: number;
}

/**
 * Walks SOI to EOI, yielding every segment in order. Returns null on any structural surprise:
 * a missing marker byte, a length that runs past the end, or a file that never reaches EOI.
 */
function readJpegSegments(bytes: Uint8Array): JpegSegment[] | null {
  if (!startsWith(bytes, jpegSignature)) return null;

  const segments: JpegSegment[] = [];
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Fill bytes: any number of 0xFF may precede a marker code.
    let markerOffset = offset;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
    if (markerOffset >= bytes.length) return null;

    const marker = bytes[markerOffset]!;
    const segmentStart = markerOffset - 1;

    if (marker === 0xd9) {
      segments.push({
        marker,
        start: segmentStart,
        end: markerOffset + 1,
        payloadStart: markerOffset + 1
      });
      return segments;
    }

    if (jpegStandaloneMarkers.has(marker)) {
      segments.push({
        marker,
        start: segmentStart,
        end: markerOffset + 1,
        payloadStart: markerOffset + 1
      });
      offset = markerOffset + 1;
      continue;
    }

    if (markerOffset + 3 > bytes.length) return null;
    const length = (bytes[markerOffset + 1]! << 8) | bytes[markerOffset + 2]!;
    if (length < 2) return null;
    const segmentEnd = markerOffset + 1 + length;
    if (segmentEnd > bytes.length) return null;

    if (marker === 0xda) {
      const scanEnd = findJpegScanEnd(bytes, segmentEnd);
      if (scanEnd === null) return null;
      segments.push({
        marker,
        start: segmentStart,
        end: scanEnd,
        payloadStart: markerOffset + 3
      });
      offset = scanEnd;
      continue;
    }

    segments.push({ marker, start: segmentStart, end: segmentEnd, payloadStart: markerOffset + 3 });
    offset = segmentEnd;
  }

  return null;
}

function findJpegScanEnd(bytes: Uint8Array, scanStart: number): number | null {
  let offset = scanStart;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const next = bytes[offset + 1]!;
    // 0xFF00 is a stuffed data byte, 0xFFFF is fill, 0xFFD0-0xFFD7 are inline restart markers.
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) {
      offset += 2;
      continue;
    }
    return offset;
  }
  return null;
}

function readJpegDimensions(bytes: Uint8Array): { widthPx: number; heightPx: number } | null {
  const segments = readJpegSegments(bytes);
  if (!segments) return null;

  for (const segment of segments) {
    if (!isJpegFrameHeader(segment.marker)) continue;
    // Frame header payload: precision (1), height (2), width (2).
    if (segment.payloadStart + 5 > bytes.length) return null;
    const heightPx = (bytes[segment.payloadStart + 1]! << 8) | bytes[segment.payloadStart + 2]!;
    const widthPx = (bytes[segment.payloadStart + 3]! << 8) | bytes[segment.payloadStart + 4]!;
    if (widthPx <= 0 || heightPx <= 0) return null;
    return { widthPx, heightPx };
  }

  return null;
}

// The one value that has to survive APP1, because it is not provenance: a phone shooting in
// portrait usually stores landscape pixels plus an Orientation tag, and browsers rotate from that
// tag. Dropping the whole segment would leave every portrait photo lying on its side, and rotating
// the pixels instead would mean decoding and re-encoding them.
//
// The tag is not copied. It is read as a single integer and a fresh 32-byte APP1 is built from
// that integer alone, so the emitted segment provably holds nothing else - no timestamp, no
// camera, no GPS - whatever the original contained.
function readJpegOrientation(bytes: Uint8Array, segments: readonly JpegSegment[]): number | null {
  for (const segment of segments) {
    if (segment.marker !== 0xe1) continue;
    const start = segment.payloadStart;
    if (readAscii(bytes, start, 4) !== 'Exif') continue;
    if (bytes[start + 4] !== 0x00 || bytes[start + 5] !== 0x00) continue;

    const tiff = start + 6;
    if (tiff + 8 > segment.end) return null;
    const byteOrder = readAscii(bytes, tiff, 2);
    if (byteOrder !== 'II' && byteOrder !== 'MM') return null;
    const little = byteOrder === 'II';
    const short = (offset: number): number =>
      little ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset);
    const long = (offset: number): number =>
      little ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset);

    if (short(tiff + 2) !== 42) return null;
    const directory = tiff + long(tiff + 4);
    if (directory + 2 > segment.end) return null;

    const entryCount = short(directory);
    for (let index = 0; index < entryCount; index += 1) {
      const entry = directory + 2 + index * 12;
      if (entry + 12 > segment.end) return null;
      if (short(entry) !== 0x0112) continue;
      // Orientation is a single SHORT, and the value is only inline because it fits in the
      // four-byte value field. An entry typed anything else has its value laid out differently -
      // a LONG occupies all four bytes, an ASCII entry holds an offset - so reading a SHORT out of
      // it would produce a number that means nothing. There is no orientation here to carry.
      if (short(entry + 2) !== 3 || long(entry + 4) !== 1) return null;
      const orientation = short(entry + 8);
      return orientation >= 1 && orientation <= 8 ? orientation : null;
    }
    return null;
  }
  return null;
}

function buildOrientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xe1,
    0x00,
    0x22,
    // "Exif\0\0", then a little-endian TIFF header whose IFD0 sits eight bytes in.
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00,
    // One entry: tag 0x0112, type SHORT, count 1, the value inline, then no next directory.
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
    orientation & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00
  ]);
}

function stripJpegMetadata(bytes: Uint8Array): StripResult {
  const segments = readJpegSegments(bytes);
  if (!segments) return { ok: false, error: 'malformed' };

  const orientation = readJpegOrientation(bytes, segments);
  const kept = segments.filter((segment) => !isJpegMetadataMarker(segment.marker));

  // Everything after EOI is trailing data no decoder reads, and is one of the easier places to
  // park a payload. The rebuilt file ends at EOI.
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientationPending = orientation !== null && orientation !== 1;
  for (const segment of kept) {
    parts.push(bytes.subarray(segment.start, segment.end));
    if (orientationPending && segment.marker === 0xe0) {
      parts.push(buildOrientationSegment(orientation!));
      orientationPending = false;
    }
  }
  if (orientationPending) parts.splice(1, 0, buildOrientationSegment(orientation!));

  return { ok: true, bytes: concatParts(parts) };
}

// --- PNG ----------------------------------------------------------------------------------------
//
// A PNG is a signature and a chunk stream, and the kept set is an allowlist for the same reason
// WebP's is: naming the metadata chunks to drop (tEXt, zTXt, iTXt, eXIf, tIME) would copy through
// every chunk type nobody thought of, including the private ones anyone may define. What is listed
// here is what a decoder needs to render the image as it was taken: the critical chunks, and the
// ancillaries that carry colour, resolution and transparency.
//
// The animation chunks (acTL, fcTL, fdAT) are deliberately absent. An animated PNG comes out as
// its first frame, which is the frame a Moderator reviewed; the alternative is approving a still
// and publishing something that moves.
//
// Chunk CRCs are never recomputed because chunks are only ever dropped whole, never edited.

const pngKeptChunks = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'pHYs',
  'gAMA',
  'sRGB',
  'iCCP',
  'cHRM',
  'sBIT',
  'bKGD'
]);

interface PngChunk {
  type: string;
  start: number;
  end: number;
  dataStart: number;
  dataLength: number;
}

function readPngChunks(bytes: Uint8Array): PngChunk[] | null {
  if (!startsWith(bytes, pngSignature)) return null;

  const chunks: PngChunk[] = [];
  let offset = pngSignature.length;

  while (offset + 8 <= bytes.length) {
    const dataLength = readUint32BE(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const end = offset + 12 + dataLength;
    if (dataLength < 0 || end > bytes.length) return null;

    chunks.push({ type, start: offset, end, dataStart: offset + 8, dataLength });
    if (type === 'IEND') return chunks;
    offset = end;
  }

  return null;
}

function readPngDimensions(bytes: Uint8Array): { widthPx: number; heightPx: number } | null {
  const chunks = readPngChunks(bytes);
  if (!chunks) return null;

  const header = chunks[0];
  if (!header || header.type !== 'IHDR' || header.dataLength !== 13) return null;

  const widthPx = readUint32BE(bytes, header.dataStart);
  const heightPx = readUint32BE(bytes, header.dataStart + 4);
  if (widthPx <= 0 || heightPx <= 0) return null;
  return { widthPx, heightPx };
}

function stripPngMetadata(bytes: Uint8Array): StripResult {
  const chunks = readPngChunks(bytes);
  if (!chunks) return { ok: false, error: 'malformed' };
  if (chunks[0]?.type !== 'IHDR') return { ok: false, error: 'malformed' };

  const kept = chunks.filter((chunk) => pngKeptChunks.has(chunk.type));
  return {
    ok: true,
    bytes: concatRanges(bytes, [
      [0, pngSignature.length],
      ...kept.map((chunk): [number, number] => [chunk.start, chunk.end])
    ])
  };
}

// --- WebP ---------------------------------------------------------------------------------------
//
// A WebP is a RIFF container. A simple file holds one VP8 or VP8L chunk and nothing else; an
// extended file leads with VP8X, whose first byte flags which optional chunks follow, and may
// carry EXIF and XMP alongside the image data.
//
// Dropping a chunk here changes two things a simple copy would leave lying: the RIFF payload size
// in the header, and the VP8X flag bits announcing chunks that are no longer there. A reader that
// trusts the flags over the chunk stream would otherwise go looking for metadata that is gone.
//
// Unknown chunks are dropped rather than copied. The known set is exactly what a decoder needs,
// so anything outside it is either metadata under a name this list does not know or padding, and
// neither belongs in a photo about to be published.
//
// ANIM and ANMF are not on it. The strip already refuses any file without a top-level VP8 or VP8L
// chunk, and an animated WebP has neither - its frames live inside ANMF - so no genuine animation
// ever reaches this filter. Keeping them would only have preserved the animation half of a
// hand-built hybrid: a still image with animation chunks bolted on, whose frames a Moderator
// reviewing the still would never see.

const webpKeptChunks = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP']);

// VP8X flag bits, per the extended-format header: ICC 0x20, alpha 0x10, EXIF 0x08, XMP 0x04,
// animation 0x02.
const webpExifFlag = 0x08;
const webpXmpFlag = 0x04;

interface WebpChunk {
  fourcc: string;
  start: number;
  end: number;
  dataStart: number;
  dataLength: number;
}

function readWebpChunks(bytes: Uint8Array): WebpChunk[] | null {
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }

  const declaredSize = readUint32LE(bytes, 4);
  const limit = Math.min(bytes.length, 8 + declaredSize);
  if (limit < 12) return null;

  const chunks: WebpChunk[] = [];
  let offset = 12;

  while (offset + 8 <= limit) {
    const fourcc = readAscii(bytes, offset, 4);
    const dataLength = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const paddedLength = dataLength + (dataLength % 2);
    // The pad byte counts. A chunk whose payload ends exactly on the limit but whose odd length
    // demands one more byte is a chunk the file does not actually contain, and copying it would
    // read past the RIFF payload into whatever follows.
    if (dataStart + paddedLength > limit) return null;

    chunks.push({ fourcc, start: offset, end: dataStart + paddedLength, dataStart, dataLength });
    offset = dataStart + paddedLength;
  }

  return chunks.length > 0 ? chunks : null;
}

function readWebpDimensions(bytes: Uint8Array): { widthPx: number; heightPx: number } | null {
  const chunks = readWebpChunks(bytes);
  if (!chunks) return null;

  const extended = chunks.find((chunk) => chunk.fourcc === 'VP8X');
  if (extended) {
    if (extended.dataLength < 10) return null;
    const widthPx = readUint24LE(bytes, extended.dataStart + 4) + 1;
    const heightPx = readUint24LE(bytes, extended.dataStart + 7) + 1;
    return { widthPx, heightPx };
  }

  const lossy = chunks.find((chunk) => chunk.fourcc === 'VP8 ');
  if (lossy) {
    // Frame tag (3), start code 0x9D 0x01 0x2A (3), then 14-bit width and height, each with a
    // 2-bit upscaling hint in the high bits that is not part of the stored size.
    if (lossy.dataLength < 10) return null;
    const start = lossy.dataStart;
    if (bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
      return null;
    }
    const widthPx = readUint16LE(bytes, start + 6) & 0x3fff;
    const heightPx = readUint16LE(bytes, start + 8) & 0x3fff;
    if (widthPx <= 0 || heightPx <= 0) return null;
    return { widthPx, heightPx };
  }

  const lossless = chunks.find((chunk) => chunk.fourcc === 'VP8L');
  if (lossless) {
    if (lossless.dataLength < 5 || bytes[lossless.dataStart] !== 0x2f) return null;
    const header = readUint32LE(bytes, lossless.dataStart + 1);
    const widthPx = (header & 0x3fff) + 1;
    const heightPx = ((header >>> 14) & 0x3fff) + 1;
    return { widthPx, heightPx };
  }

  return null;
}

function stripWebpMetadata(bytes: Uint8Array): StripResult {
  const chunks = readWebpChunks(bytes);
  if (!chunks) return { ok: false, error: 'malformed' };
  if (!chunks.some((chunk) => chunk.fourcc === 'VP8 ' || chunk.fourcc === 'VP8L')) {
    return { ok: false, error: 'malformed' };
  }

  const kept = chunks.filter((chunk) => webpKeptChunks.has(chunk.fourcc));
  const parts: Uint8Array[] = [];
  for (const chunk of kept) {
    const slice = bytes.slice(chunk.start, chunk.end);
    if (chunk.fourcc === 'VP8X' && chunk.dataLength >= 1) {
      slice[8] = slice[8]! & ~(webpExifFlag | webpXmpFlag);
    }
    parts.push(slice);
  }

  const payloadLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(12 + payloadLength);
  output.set(bytes.subarray(0, 12), 0);
  writeUint32LE(output, 4, 4 + payloadLength);

  let offset = 12;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return { ok: true, bytes: output };
}

// --- Byte helpers -------------------------------------------------------------------------------

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset + 3]! << 24) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 1]! << 8) |
      bytes[offset]!) >>>
    0
  );
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concatParts(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function concatRanges(
  bytes: Uint8Array,
  ranges: readonly [number, number][]
): Uint8Array<ArrayBuffer> {
  const total = ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const [start, end] of ranges) {
    output.set(bytes.subarray(start, end), offset);
    offset += end - start;
  }
  return output;
}
