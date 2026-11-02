/**
 * Client-side image compression. Runs before the blob is written to
 * IndexedDB, because browser storage is the scarce resource here — the origin
 * quota is shared by every note and every attachment.
 *
 * Matches the behaviour described in the plan: WebP, longest edge capped at
 * 2560px, and the original is kept whenever compression does not help.
 */

export const MAX_IMAGE_EDGE = 2560;
export const WEBP_QUALITY = 0.82;

const COMPRESSIBLE = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
  /** False when the original was kept. */
  compressed: boolean;
  originalSize: number;
}

export function isCompressible(mime: string): boolean {
  return COMPRESSIBLE.has(mime.toLowerCase());
}

/** Exported for tests: the downscale maths, independent of any canvas. */
export function scaledSizeForTest(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  return scaledSize(width, height, maxEdge);
}

function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Downscale and re-encode an image. Falls back to the original on any
 * failure — a compression bug must never cost the user their image.
 */
export async function compressImage(
  file: Blob,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<CompressedImage> {
  const { maxEdge = MAX_IMAGE_EDGE, quality = WEBP_QUALITY } = options;

  let width = 0;
  let height = 0;

  if (!isCompressible(file.type)) {
    return { blob: file, width: 0, height: 0, mime: file.type, compressed: false, originalSize: file.size };
  }

  if (typeof createImageBitmap !== "function") {
    return { blob: file, width: 0, height: 0, mime: file.type, compressed: false, originalSize: file.size };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;

    const target = scaledSize(width, height, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D context unavailable");
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const encoded = await canvasToBlob(canvas, "image/webp", quality);
    if (!encoded || encoded.size >= file.size) {
      // WebP did not help — keep the original bytes rather than regress.
      return {
        blob: file,
        width,
        height,
        mime: file.type,
        compressed: false,
        originalSize: file.size,
      };
    }

    return {
      blob: encoded,
      width: target.width,
      height: target.height,
      mime: "image/webp",
      compressed: true,
      originalSize: file.size,
    };
  } catch {
    return {
      blob: file,
      width,
      height,
      mime: file.type,
      compressed: false,
      originalSize: file.size,
    };
  } finally {
    bitmap?.close?.();
  }
}
