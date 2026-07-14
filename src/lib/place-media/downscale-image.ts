// Client-side display-variant generation for Photo uploads.
// A photo is downscaled in
// the browser before it ever reaches Supabase Storage - this is the only object stored for a
// Photo, and there is no separate full-resolution original.
// Evidence screenshots are never downscaled: provenance
// fidelity matters more than bandwidth for a Moderator-only asset.

export const placeMediaDisplayMaxEdge = 1600;
export const placeMediaDisplayQuality = 0.85;
const imageProcessingTimeoutMs = 10_000;

export interface ImageDimensions {
  width: number;
  height: number;
}

// Pure and unit-testable without a real canvas: computes the target dimensions for a downscale
// that never enlarges a smaller source image and always preserves aspect ratio.
export function computeDownscaledDimensions(
  source: ImageDimensions,
  maxEdge: number
): ImageDimensions {
  if (source.width <= 0 || source.height <= 0 || maxEdge <= 0) {
    throw new RangeError('Image dimensions and the target edge must be positive');
  }

  const longestEdge = Math.max(source.width, source.height);
  if (longestEdge <= maxEdge) {
    return { width: Math.round(source.width), height: Math.round(source.height) };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale))
  };
}

export async function readImageDimensions(file: File): Promise<ImageDimensions> {
  // `imageOrientation: 'from-image'` bakes the file's EXIF orientation into the decoded bitmap's
  // pixels, so a portrait phone photo (commonly EXIF orientation 6) reports display-oriented
  // width/height here instead of the sensor's un-rotated dimensions. Without this, a landscape
  // sensor capture of a portrait subject is read back as landscape and everything downstream
  // (downscale target, stored width_px/height_px, and the rendered <img>) is rotated 90 degrees.
  const bitmap = await createOrientedBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export interface DownscaledImage {
  file: File;
  width: number;
  height: number;
}

// Downscales `source` to at most `maxEdge` on its longest side, re-encoded as JPEG. Browser-only
// (uses OffscreenCanvas/canvas 2D); component tests exercise this in a real browser context.
export async function downscaleImageFile(
  source: File,
  maxEdge: number = placeMediaDisplayMaxEdge,
  quality: number = placeMediaDisplayQuality
): Promise<DownscaledImage> {
  // See readImageDimensions: 'from-image' orients the decoded bitmap to match how the photo is
  // meant to display, so the canvas re-encode below does not bake in a rotated result.
  const bitmap = await createOrientedBitmap(source);
  try {
    const target = computeDownscaledDimensions(
      { width: bitmap.width, height: bitmap.height },
      maxEdge
    );

    const blob = await encodeDisplayVariant(bitmap, target, quality);

    const fileName = source.name.replace(/\.[^./\\]+$/, '') || 'photo';
    return {
      file: new File([blob], `${fileName}.jpg`, { type: 'image/jpeg' }),
      width: target.width,
      height: target.height
    };
  } finally {
    bitmap.close();
  }
}

async function createOrientedBitmap(file: File): Promise<ImageBitmap> {
  const bitmapPromise = createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await withTimeout(bitmapPromise, imageProcessingTimeoutMs, 'Image decoding timed out');
  } catch (error) {
    void bitmapPromise.then(
      (bitmap) => bitmap.close(),
      () => undefined
    );
    throw error;
  }
}

async function encodeDisplayVariant(
  bitmap: ImageBitmap,
  target: ImageDimensions,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    try {
      const canvas = new OffscreenCanvas(target.width, target.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Offscreen canvas 2D context is unavailable');
      paintDisplayVariant(context, bitmap, target);
      return await withTimeout(
        canvas.convertToBlob({ type: 'image/jpeg', quality }),
        imageProcessingTimeoutMs,
        'Offscreen image encoding timed out'
      );
    } catch {
      // Some browsers expose OffscreenCanvas before its encoder is dependable. Fall back to the
      // DOM canvas path, but keep that callback bounded as well so the upload UI can always recover.
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  paintDisplayVariant(context, bitmap, target);

  const encoding = new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas could not encode the downscaled image'));
      },
      'image/jpeg',
      quality
    );
  });
  return withTimeout(encoding, imageProcessingTimeoutMs, 'Image encoding timed out');
}

function paintDisplayVariant(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  target: ImageDimensions
): void {
  // The source may be a transparent PNG/WebP; re-encoding straight to JPEG (which has no alpha
  // channel) would otherwise flatten transparent pixels to black. Fill white first so
  // transparency reads as a white background, matching how the photo will actually be viewed.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(bitmap, 0, 0, target.width, target.height);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
