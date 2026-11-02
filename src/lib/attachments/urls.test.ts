import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireUrl,
  attachmentRef,
  isAttachmentRef,
  parseAttachmentRef,
  refCounts,
  releaseAll,
  releaseUrl,
} from "./urls";
import { withTestDb } from "@/lib/db/test-helpers";
import { addAttachment } from "@/lib/db/repositories/attachments";
import { createNote } from "@/lib/db/repositories/notes";

/**
 * Object URL lifetime.
 *
 * Every `createObjectURL` must be matched by a revoke or the blob stays
 * resident for the life of the document — a real leak in an app that opens
 * many notes. These tests use a counting stub so leaks are failures.
 */
withTestDb();

let created: string[];
let revoked: string[];

/** jsdom has no object URLs. */
beforeEach(() => {
  created = [];
  revoked = [];
  let counter = 0;

  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:test/${++counter}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });

  releaseAll();
});

afterEach(() => {
  releaseAll();
  vi.unstubAllGlobals();
});

async function seedAttachment(): Promise<string> {
  const note = await createNote({ title: "with image" });
  const attachment = await addAttachment({
    noteId: note.id,
    fileName: "photo.png",
    mime: "image/png",
    blob: new Blob([new Uint8Array(64)], { type: "image/png" }),
  });
  return attachment.id;
}

describe("reference format", () => {
  it("round-trips an attachment id", () => {
    const ref = attachmentRef("abc-123");
    expect(ref).toBe("attachment://abc-123");
    expect(isAttachmentRef(ref)).toBe(true);
    expect(parseAttachmentRef(ref)).toBe("abc-123");
  });

  it("rejects a real URL", () => {
    expect(isAttachmentRef("https://example.com/a.png")).toBe(false);
    expect(parseAttachmentRef("https://example.com/a.png")).toBeNull();
  });

  it("rejects a blob URL — those die with the document", () => {
    // The whole reason attachment:// exists.
    expect(isAttachmentRef("blob:http://localhost/abc")).toBe(false);
  });
});

describe("acquire and release", () => {
  it("creates one URL and shares it between holders", async () => {
    const id = await seedAttachment();

    const first = await acquireUrl(id);
    const second = await acquireUrl(id);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
    expect(refCounts().get(id)).toBe(2);
  });

  it("revokes only when the last holder releases", async () => {
    const id = await seedAttachment();

    await acquireUrl(id);
    await acquireUrl(id);

    releaseUrl(id);
    expect(revoked).toHaveLength(0);

    releaseUrl(id);
    expect(revoked).toHaveLength(1);
    expect(refCounts().has(id)).toBe(false);
  });

  it("resolves to null for a missing attachment and creates nothing", async () => {
    const url = await acquireUrl("does-not-exist");
    expect(url).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("deduplicates concurrent acquisitions into one URL", async () => {
    const id = await seedAttachment();

    const [a, b, c] = await Promise.all([acquireUrl(id), acquireUrl(id), acquireUrl(id)]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(created).toHaveLength(1);
  });

  it("leaks nothing after a full acquire/release cycle", async () => {
    const id = await seedAttachment();

    for (let i = 0; i < 25; i++) {
      await acquireUrl(id);
      releaseUrl(id);
    }

    expect(created.length).toBe(revoked.length);
    expect(refCounts().size).toBe(0);
  });

  it("releaseAll revokes everything outstanding", async () => {
    const a = await seedAttachment();
    const b = await seedAttachment();
    await acquireUrl(a);
    await acquireUrl(b);

    releaseAll();

    expect(revoked).toHaveLength(2);
    expect(refCounts().size).toBe(0);
  });
});
