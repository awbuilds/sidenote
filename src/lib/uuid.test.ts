import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("accepts version-4 style ids", () => {
    expect(isUuid("b0988405-e1cc-46b6-882b-4bab0cefdcd3")).toBe(true);
    expect(isUuid("B0988405-E1CC-46B6-882B-4BAB0CEFDCD3")).toBe(true);
  });

  it("rejects seed-style ids and near-misses", () => {
    expect(isUuid("seed-notebook-engineering")).toBe(false);
    expect(isUuid("b0988405-e1cc-46b6-882b-4bab0cefdcd")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid-at-all")).toBe(false);
  });
});
