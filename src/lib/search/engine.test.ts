import { describe, expect, it } from "vitest";
import MiniSearch from "minisearch";
import { buildDocs, createIndex, search, snippetFor } from "./engine";

function indexOf(notes: { id: string; title: string; text: string }[]) {
  const index = createIndex();
  index.addAll(notes.map((note) => ({ ...note, updatedAt: 0 })));
  return index;
}

const CORPUS = [
  { id: "1", title: "Roadmap", text: "Ship the editor, then the notes export, then the backend." },
  { id: "2", title: "Reading list", text: "Designing Data-Intensive Applications, Kleppmann." },
  { id: "3", title: "TypeScript notes", text: "IndexedDB cannot index booleans or null values." },
  { id: "4", title: "Grocery", text: "Coffee, oats, olive oil." },
];

describe("indexing and search", () => {
  it("finds a body-text term", () => {
    const hits = search(indexOf(CORPUS), "Kleppmann");
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("2");
  });

  it("finds a title term", () => {
    const hits = search(indexOf(CORPUS), "roadmap");
    expect(hits.map((h) => h.id)).toContain("1");
  });

  it("matches a prefix, so results appear mid-word", () => {
    const hits = search(indexOf(CORPUS), "data-in");
    expect(hits.map((h) => h.id)).toContain("2");
  });

  it("ranks a title match above a body match", () => {
    // "notes" is 1 in the title of note 3 and in the body of note 1.
    const hits = search(indexOf(CORPUS), "notes");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0].id).toBe("3");
  });

  it("returns nothing for a query with no matches", () => {
    expect(search(indexOf(CORPUS), "zzzznotpresent")).toHaveLength(0);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(search(indexOf(CORPUS), "")).toHaveLength(0);
    expect(search(indexOf(CORPUS), "   ")).toHaveLength(0);
  });

  it("honours the result limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      title: `Note ${i}`,
      text: "shared keyword",
    }));
    expect(search(indexOf(many), "shared", 5)).toHaveLength(5);
  });

  it("is case-insensitive", () => {
    const hits = search(indexOf(CORPUS), "COFFEE");
    expect(hits.map((h) => h.id)).toContain("4");
  });
});

describe("buildDocs", () => {
  it("maps notes onto index documents", () => {
    const docs = buildDocs([
      { id: "a", title: "T", contentText: "body", updatedAt: 123 },
    ]);
    expect(docs).toEqual([{ id: "a", title: "T", text: "body", updatedAt: 123 }]);
  });
});

describe("serialisation", () => {
  it("survives a JSON round trip, so the index can be persisted", () => {
    const original = indexOf(CORPUS);

    // Exactly what the worker does on "restore".
    const loaded = MiniSearch.loadJSON<{ id: string; title: string; text: string; updatedAt: number }>(
      JSON.stringify(original),
      { fields: ["title", "text"], storeFields: ["title", "text", "updatedAt"] },
    );

    expect(loaded.documentCount).toBe(4);
    expect(search(loaded, "Kleppmann").map((h) => h.id)).toEqual(["2"]);
    expect(search(loaded, "roadmap").map((h) => h.id)).toEqual(["1"]);
  });
});

describe("snippetFor", () => {
  it("windows around the matched term", () => {
    const hits = search(indexOf(CORPUS), "olive");
    expect(snippetFor(hits[0])).toContain("olive");
  });

  it("falls back to the start of the text when there are no terms", () => {
    const hit = {
      id: "x",
      title: "t",
      text: "some body text",
      score: 1,
      terms: [],
      updatedAt: 0,
    };
    expect(snippetFor(hit, 50)).toBe("some body text");
  });

  it("marks elision when the window is mid-text", () => {
    const long = "x".repeat(400) + " needle " + "y".repeat(400);
    const hit = { id: "x", title: "", text: long, score: 1, terms: ["needle"], updatedAt: 0 };
    const snippet = snippetFor(hit, 60);
    expect(snippet).toContain("needle");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });
});
