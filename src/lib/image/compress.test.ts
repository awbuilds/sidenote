import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage, isCompressible, scaledSizeForTest } from "./compress";

/**
 * jsdom has no canvas and no `createImageBitmap`, so the real encode path
 * cannot run here. What these tests pin down is the decision logic around it:
 * which types are eligible, the downscale maths, and — most importantly — that
 * a failure never costs the user their image.
 */

function pngBlob(bytes = 1024): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe("isCompressible", () => {
  it("accepts the raster formats that benefit from re-encoding", () => {
    expect(isCompressible("image/png")).toBe(true);
    expect(isCompressible("image/jpeg")).toBe(true);
    expect(isCompressible("image/webp")).toBe(true);
    expect(isCompressible("image/avif")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isCompressible("image/svg+xml")).toBe(false);
    expect(isCompressible("application/pdf")).toBe(false);
    expect(isCompressible("text/plain")).toBe(false);
    expect(isCompressible("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isCompressible("IMAGE/PNG")).toBe(true);
  });
});

describe("scaledSize", () => {
  it("leaves an image under the cap alone", () => {
    expect(scaledSizeForTest(1200, 800, 2560)).toEqual({ width: 1200, height: 800 });
  });

  it("scales the longest edge down to the cap, preserving aspect ratio", () => {
    expect(scaledSizeForTest(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
  });

  it("handles a portrait image", () => {
    expect(scaledSizeForTest(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
  });

  it("never rounds a dimension down to zero", () => {
    const result = scaledSizeForTest(10000, 1, 2560);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });
});

describe("compressImage", () => {
  it("returns the original untouched for a non-compressible type", async () => {
    const file = new Blob(["<svg/>"], { type: "image/svg+xml" });
    const result = await compressImage(file);

    expect(result.compressed).toBe(false);
    expect(result.blob).toBe(file);
    expect(result.mime).toBe("image/svg+xml");
  });

  it("returns the original when createImageBitmap is unavailable", async () => {
    // jsdom's default — no canvas pipeline at all.
    const file = pngBlob();
    const result = await compressImage(file);

    expect(result.compressed).toBe(false);
    expect(result.blob).toBe(file);
    expect(result.originalSize).toBe(file.size);
  });

  it("returns the original when createImageBitmap rejects", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));

    const file = pngBlob(2048);
    const result = await compressImage(file);

    expect(result.compressed).toBe(false);
    expect(result.blob).toBe(file);
  });

  it("returns the original when the 2D context is unavailable", async () => {
    const fakeBitmap = { width: 100, height: 100, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const file = pngBlob(2048);
    const result = await compressImage(file);

    expect(result.compressed).toBe(false);
    expect(result.blob).toBe(file);
  });

  it("keeps the original when WebP encoding does not shrink it", async () => {
    const fakeBitmap = { width: 100, height: 100, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    // toBlob yields something *bigger* than the input.
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob([new Uint8Array(9999)], { type: "image/webp" }));
    });

    const file = pngBlob(512);
    const result = await compressImage(file);

    expect(result.compressed).toBe(false);
    expect(result.blob).toBe(file);
  });

  it("uses the re-encoded WebP when it is smaller, and closes the bitmap", async () => {
    const close = vi.fn();
    const fakeBitmap = { width: 4000, height: 3000, close };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(fakeBitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob([new Uint8Array(100)], { type: "image/webp" }));
    });

    const file = pngBlob(5000);
    const result = await compressImage(file);

    expect(result.compressed).toBe(true);
    expect(result.mime).toBe("image/webp");
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1920);
    expect(close).toHaveBeenCalled();
  });
});
