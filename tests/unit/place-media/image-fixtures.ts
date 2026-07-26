/**
 * Real image containers, assembled byte by byte, with real metadata in them.
 *
 * The stripper is byte-level container surgery, so a fixture that is not a genuine container
 * proves nothing about it. These builders emit files a decoder would accept structurally - correct
 * segment lengths, correct chunk CRCs, correct RIFF sizing - carrying an EXIF block with
 * recognizable GPS bytes, so a test can assert both that the metadata is gone and that everything
 * else survived unchanged.
 */

/** A byte run that appears only inside metadata, so finding it in output is proof of a leak. */
export const gpsMarker = 'GPS 64.1466 N 21.9426 W';

export function bytesOf(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

export function indexOfSequence(haystack: Uint8Array, needle: readonly number[]): number {
  outer: for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return start;
  }
  return -1;
}

export function containsSequence(haystack: Uint8Array, needle: readonly number[]): boolean {
  return indexOfSequence(haystack, needle) >= 0;
}

function concat(parts: readonly (readonly number[])[]): Uint8Array {
  return Uint8Array.from(parts.flat());
}

function uint16BE(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function uint24LE(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function uint16LE(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

// --- JPEG ---------------------------------------------------------------------------------------

/** A marker segment: 0xFF, the marker code, a length covering itself, and the payload. */
function jpegSegment(marker: number, payload: readonly number[]): number[] {
  return [0xff, marker, ...uint16BE(payload.length + 2), ...payload];
}

const jfifPayload = [
  ...bytesOf('JFIF'),
  0x00,
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00
];

/**
 * "Exif\0\0", a little-endian TIFF header, an Orientation entry and an ASCII entry holding the
 * location. Offsets inside a TIFF block are relative to the byte-order mark, so the description
 * data sits at TIFF offset 38 - payload index 44, six bytes further along.
 */
function exifWithOrientation(orientation: number, orientationType = 3): number[] {
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
    0x02,
    0x00,
    // Orientation: tag 0x0112, type SHORT (3) unless a test asks for another, count 1, value
    // inline. A LONG-typed entry is malformed for this tag and lays its value out differently.
    0x12,
    0x01,
    orientationType & 0xff,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation & 0xff,
    0x00,
    0x00,
    0x00,
    // ImageDescription: tag 0x010e, type ASCII, count N, value at TIFF offset 38.
    0x0e,
    0x01,
    0x02,
    0x00,
    ...uint32LE(description.length),
    ...uint32LE(38),
    0x00,
    0x00,
    0x00,
    0x00,
    ...description
  ];
}

/** "Exif\0\0", a little-endian TIFF header, and one ASCII entry holding the location. */
const exifPayload = [
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
  0x25,
  0x88,
  0x02,
  0x00,
  ...bytesOf(gpsMarker),
  0x00
];

const quantizationPayload = [0x00, ...new Array<number>(64).fill(0x10)];
const huffmanPayload = [0x00, ...new Array<number>(16).fill(0x00), 0x00];

// The scan deliberately contains a stuffed 0xFF00 and an inline restart marker, because those are
// exactly the two byte pairs a naive marker scan would mistake for the end of the image.
const scanPayload = [
  0xaa, 0xff, 0x00, 0xbb, 0xcc, 0xff, 0xd0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde
];

export interface JpegFixtureOptions {
  widthPx?: number;
  heightPx?: number;
  frameMarker?: number;
  withExif?: boolean;
  withComment?: boolean;
  withXmp?: boolean;
  withTrailingData?: boolean;
  orientation?: number;
  /** The TIFF type the Orientation entry declares. 3 is SHORT, which is the only correct one. */
  orientationType?: number;
}

export function buildJpeg(options: JpegFixtureOptions = {}): Uint8Array {
  const {
    widthPx = 640,
    heightPx = 480,
    frameMarker = 0xc0,
    withExif = true,
    withComment = true,
    withXmp = true,
    withTrailingData = true,
    orientation,
    orientationType = 3
  } = options;

  const frame = [
    0x08,
    ...uint16BE(heightPx),
    ...uint16BE(widthPx),
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01
  ];
  const scanHeader = [0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00];

  return concat([
    [0xff, 0xd8],
    jpegSegment(0xe0, jfifPayload),
    withExif
      ? jpegSegment(
          0xe1,
          orientation === undefined
            ? exifPayload
            : exifWithOrientation(orientation, orientationType)
        )
      : [],
    withXmp
      ? jpegSegment(0xe2, [...bytesOf('http://ns.adobe.com/xap/1.0/'), 0x00, ...bytesOf(gpsMarker)])
      : [],
    withComment ? jpegSegment(0xfe, bytesOf(`Photographed at ${gpsMarker}`)) : [],
    jpegSegment(0xdb, quantizationPayload),
    jpegSegment(frameMarker, frame),
    jpegSegment(0xc4, huffmanPayload),
    jpegSegment(0xda, scanHeader),
    scanPayload,
    [0xff, 0xd9],
    withTrailingData ? bytesOf(`trailing ${gpsMarker}`) : []
  ]);
}

/** The entropy-coded scan, so a test can assert the pixels came through untouched. */
export const jpegScanBytes: readonly number[] = scanPayload;

// --- PNG ----------------------------------------------------------------------------------------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: readonly number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: readonly number[]): number[] {
  const typed = [...bytesOf(type), ...data];
  return [...uint32BE(data.length), ...typed, ...uint32BE(crc32(typed))];
}

const pngPixelData = [0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01];

export interface PngFixtureOptions {
  widthPx?: number;
  heightPx?: number;
  withText?: boolean;
  withExif?: boolean;
  withTime?: boolean;
  withPhysical?: boolean;
  /**
   * An ancillary chunk under a type no allowlist knows: lower-case first letter, so a decoder is
   * free to ignore it, and anything at all inside it.
   */
  withUnknownChunk?: boolean;
  /** The animation control chunk that turns a PNG into an APNG. */
  withAnimation?: boolean;
}

export function buildPng(options: PngFixtureOptions = {}): Uint8Array {
  const {
    widthPx = 320,
    heightPx = 240,
    withText = true,
    withExif = true,
    withTime = true,
    withPhysical = true,
    withUnknownChunk = false,
    withAnimation = false
  } = options;

  return concat([
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk('IHDR', [...uint32BE(widthPx), ...uint32BE(heightPx), 0x08, 0x02, 0x00, 0x00, 0x00]),
    withText ? pngChunk('tEXt', [...bytesOf('Comment'), 0x00, ...bytesOf(gpsMarker)]) : [],
    withText
      ? pngChunk('iTXt', [
          ...bytesOf('XML:com.adobe.xmp'),
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          ...bytesOf(gpsMarker)
        ])
      : [],
    withExif ? pngChunk('eXIf', [...bytesOf('II'), 0x2a, 0x00, ...bytesOf(gpsMarker)]) : [],
    withTime ? pngChunk('tIME', [0x07, 0xea, 0x07, 0x19, 0x0c, 0x00, 0x00]) : [],
    withPhysical ? pngChunk('pHYs', [...uint32BE(2835), ...uint32BE(2835), 0x01]) : [],
    withUnknownChunk ? pngChunk('prVt', bytesOf(gpsMarker)) : [],
    withAnimation ? pngChunk('acTL', [...uint32BE(2), ...uint32BE(0)]) : [],
    pngChunk('IDAT', pngPixelData),
    pngChunk('IEND', [])
  ]);
}

export const pngIdatBytes: readonly number[] = pngPixelData;

// --- WebP ---------------------------------------------------------------------------------------

function riffChunk(fourcc: string, data: readonly number[]): number[] {
  const padded = data.length % 2 === 1 ? [...data, 0x00] : [...data];
  return [...bytesOf(fourcc), ...uint32LE(data.length), ...padded];
}

const webpLosslessData = [0x2f, 0x00, 0x00, 0x00, 0x00, 0x11, 0x22, 0x33];
const webpLossyData = [
  0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x00, 0x00, 0x00, 0x00, 0x44, 0x55, 0x66
];

function withVp8lDimensions(widthPx: number, heightPx: number): number[] {
  const header = ((widthPx - 1) & 0x3fff) | (((heightPx - 1) & 0x3fff) << 14);
  return [0x2f, ...uint32LE(header >>> 0), ...webpLosslessData.slice(5)];
}

function withVp8Dimensions(widthPx: number, heightPx: number): number[] {
  return [
    ...webpLossyData.slice(0, 6),
    ...uint16LE(widthPx & 0x3fff),
    ...uint16LE(heightPx & 0x3fff),
    ...webpLossyData.slice(10)
  ];
}

export interface WebpFixtureOptions {
  widthPx?: number;
  heightPx?: number;
  extended?: boolean;
  lossless?: boolean;
  withExif?: boolean;
  withXmp?: boolean;
  withColourProfile?: boolean;
}

export function buildWebp(options: WebpFixtureOptions = {}): Uint8Array {
  const {
    widthPx = 200,
    heightPx = 100,
    extended = true,
    lossless = true,
    withExif = true,
    withXmp = true,
    withColourProfile = true
  } = options;

  // ICC 0x20, alpha 0x10, EXIF 0x08, XMP 0x04, animation 0x02.
  const flags =
    (withColourProfile ? 0x20 : 0x00) | (withExif ? 0x08 : 0x00) | (withXmp ? 0x04 : 0x00);

  const imageChunk = lossless
    ? riffChunk('VP8L', withVp8lDimensions(widthPx, heightPx))
    : riffChunk('VP8 ', withVp8Dimensions(widthPx, heightPx));

  const body = extended
    ? [
        ...riffChunk('VP8X', [
          flags,
          0x00,
          0x00,
          0x00,
          ...uint24LE(widthPx - 1),
          ...uint24LE(heightPx - 1)
        ]),
        ...(withColourProfile ? riffChunk('ICCP', [0x01, 0x02, 0x03, 0x04]) : []),
        ...imageChunk,
        ...(withExif
          ? riffChunk('EXIF', [...bytesOf('II'), 0x2a, 0x00, ...bytesOf(gpsMarker)])
          : []),
        ...(withXmp ? riffChunk('XMP ', bytesOf(`<x:xmpmeta>${gpsMarker}</x:xmpmeta>`)) : [])
      ]
    : imageChunk;

  return concat([bytesOf('RIFF'), uint32LE(4 + body.length), bytesOf('WEBP'), body]);
}
