import { describe, expect, it } from "vitest";
import {
  backlinkRelevance,
  extractWikiLinks,
  linkTitles,
  wikiLink,
  wikiLinkText,
} from "./wiki";

describe("extractWikiLinks", () => {
  it("finds a simple link", () => {
    expect(extractWikiLinks("see [[Roof]] for details")).toEqual([
      { title: "Roof", alias: null, index: 4 },
    ]);
  });

  it("finds every link in order", () => {
    const links = extractWikiLinks("[[One]] and [[Two]] and [[Three]]");
    expect(links.map((l) => l.title)).toEqual(["One", "Two", "Three"]);
  });

  it("reads the alias from a piped link", () => {
    const [link] = extractWikiLinks("[[Long Title|the short one]]");
    expect(link?.title).toBe("Long Title");
    expect(link?.alias).toBe("the short one");
  });

  it("trims surrounding whitespace", () => {
    expect(extractWikiLinks("[[  Spaced  ]]")[0]?.title).toBe("Spaced");
  });

  it("ignores a link naming nothing", () => {
    expect(extractWikiLinks("[[]] and [[   ]]")).toEqual([]);
  });

  it("ignores a link with only an alias", () => {
    expect(extractWikiLinks("[[|alias only]]")).toEqual([]);
  });

  it("keeps a pipe inside the alias rather than the title", () => {
    const [link] = extractWikiLinks("[[Title|a | b]]");
    expect(link?.title).toBe("Title");
    expect(link?.alias).toBe("a | b");
  });

  it("does not match a single bracket pair", () => {
    expect(extractWikiLinks("[single] and [double][]")).toEqual([]);
  });

  it("reads the innermost pair when brackets nest", () => {
    // Documented behaviour: the inner pair wins, because the character class
    // cannot span a bracket. See extractWikiLinks.
    expect(extractWikiLinks("[[a [[b]] c]]").map((l) => l.title)).toEqual(["b"]);
  });

  it("handles an empty body", () => {
    expect(extractWikiLinks("")).toEqual([]);
  });

  it("handles a link at the very start and very end", () => {
    // "[[A]]" is 0-4, the space is 5, "middle" 6-11, so "[[B]]" starts at 13.
    expect(extractWikiLinks("[[A]] middle [[B]]").map((l) => l.index)).toEqual([0, 13]);
  });
});

describe("linkTitles", () => {
  it("deduplicates case-insensitively, keeping first appearance", () => {
    expect(linkTitles("[[Roof]] then [[roof]] then [[Wall]]")).toEqual(["Roof", "Wall"]);
  });

  it("keeps a piped alias from becoming a separate link", () => {
    expect(linkTitles("[[Roof|the top]]")).toEqual(["Roof"]);
  });

  it("returns an empty list for a body with no links", () => {
    expect(linkTitles("just prose")).toEqual([]);
  });
});

describe("wikiLink", () => {
  it("wraps a title", () => {
    expect(wikiLink("Roof")).toBe("[[Roof]]");
  });

  it("strips brackets that would break the syntax", () => {
    expect(wikiLink("Weird [Title]")).toBe("[[Weird Title]]");
  });

  it("round-trips through extraction", () => {
    expect(extractWikiLinks(wikiLink("Roof"))[0]?.title).toBe("Roof");
  });
});

describe("wikiLinkText", () => {
  it("prefers the alias when there is one", () => {
    expect(wikiLinkText({ title: "A", alias: "B", index: 0 })).toBe("B");
  });

  it("falls back to the title", () => {
    expect(wikiLinkText({ title: "A", alias: null, index: 0 })).toBe("A");
  });

  it("treats an empty alias as no alias", () => {
    expect(wikiLinkText({ title: "A", alias: "", index: 0 })).toBe("");
  });
});

describe("backlinkRelevance", () => {
  it("scores an exact title match above a partial one", () => {
    const exact = backlinkRelevance("about the Roof and rafters", "Roof");
    const partial = backlinkRelevance("about roofing and rafters", "Roof");
    expect(exact).toBeGreaterThan(partial);
  });

  it("scores a body that never mentions it at zero", () => {
    expect(backlinkRelevance("completely unrelated prose", "Roof")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(backlinkRelevance("the ROOF", "roof")).toBeGreaterThan(0);
  });

  it("returns zero for an empty body or title", () => {
    expect(backlinkRelevance("", "Roof")).toBe(0);
    expect(backlinkRelevance("the Roof", "  ")).toBe(0);
  });

  it("is capped so one long note cannot dominate", () => {
    const spam = "Roof ".repeat(500);
    expect(backlinkRelevance(spam, "Roof", 2)).toBe(20);
  });
});
