import { describe, expect, it } from "vitest";
import {
  FREE_ATTACHMENT_BYTES,
  attachmentStoragePath,
  exceedsAttachmentBudget,
} from "./path";

describe("attachmentStoragePath", () => {
  it("namespaces by user and attachment", () => {
    expect(attachmentStoragePath("user-1", "att-1", "photo.webp")).toBe("user-1/att-1/photo.webp");
  });

  it("sanitises slashes so a filename cannot escape its folder", () => {
    expect(attachmentStoragePath("u", "a", "../../etc/passwd")).toBe("u/a/.._.._etc_passwd");
    expect(attachmentStoragePath("u", "a", "a\\b.png")).toBe("u/a/a_b.png");
  });

  it("falls back for an empty name", () => {
    expect(attachmentStoragePath("u", "a", "")).toBe("u/a/file");
  });
});

describe("exceedsAttachmentBudget", () => {
  it("allows a file that exactly fills the budget", () => {
    expect(exceedsAttachmentBudget(FREE_ATTACHMENT_BYTES - 10, 10)).toBe(false);
  });

  it("refuses one byte over", () => {
    expect(exceedsAttachmentBudget(FREE_ATTACHMENT_BYTES - 10, 11)).toBe(true);
  });
});
