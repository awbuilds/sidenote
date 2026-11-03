import { describe, expect, it } from "vitest";
import {
  StorageQuotaError,
  formatBytes,
  guardedWrite,
  isQuotaError,
} from "./quota";

describe("isQuotaError", () => {
  it("recognises a DOMException QuotaExceededError", () => {
    expect(isQuotaError(new DOMException("full", "QuotaExceededError"))).toBe(true);
  });

  it("recognises the legacy numeric code", () => {
    const error = new DOMException("full", "QuotaExceededError");
    expect(error.code).toBe(22);
    expect(isQuotaError(error)).toBe(true);
  });

  it("recognises a duck-typed name, which is what some browsers throw", () => {
    expect(isQuotaError({ name: "QuotaExceededError" })).toBe(true);
  });

  it("recognises the wrapper this module throws", () => {
    expect(isQuotaError(new StorageQuotaError("full", new Error("cause")))).toBe(true);
  });

  it("does not treat an unrelated failure as a quota problem", () => {
    expect(isQuotaError(new Error("network down"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError({ name: "AbortError" })).toBe(false);
  });
});

describe("guardedWrite", () => {
  it("wraps a quota failure in StorageQuotaError", async () => {
    const write = () => Promise.reject(new DOMException("full", "QuotaExceededError"));

    await expect(guardedWrite("save the note", write)).rejects.toBeInstanceOf(
      StorageQuotaError,
    );
  });

  it("passes a non-quota failure through untouched", async () => {
    const original = new Error("transaction aborted");
    const write = () => Promise.reject(original);

    await expect(guardedWrite("save the note", write)).rejects.toBe(original);
  });

  it("returns the value on success", async () => {
    await expect(guardedWrite("save the note", () => Promise.resolve(42))).resolves.toBe(42);
  });
});

describe("formatBytes", () => {
  it("formats the sizes the settings screen shows", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
  });

  it("refuses to invent a number for a broken estimate", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});
