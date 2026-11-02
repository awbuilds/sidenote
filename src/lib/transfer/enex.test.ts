import { describe, expect, it } from "vitest";
import { parseEnex, parseEnexDate, parseEnexNotebooks } from "./enex";

const SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<en-export export-date="20260101T000000Z">
  <note>
    <title>First note</title>
    <content-enclosed><![CDATA[<en-note><div>Hello <b>world</b></div></en-note>]]></content-enclosed>
    <created>20250115T093000Z</created>
    <updated>20250220T141500Z</updated>
    <tag>work</tag>
    <tag>urgent</tag>
  </note>
</en-export>`;

const WITH_NOTEBOOKS = `<?xml version="1.0" encoding="UTF-8"?>
<en-export export-date="20260101T000000Z">
  <notebook>
    <name>Work</name>
    <note>
      <title>Meeting notes</title>
      <content-enclosed><![CDATA[<en-note><div>Agenda</div></en-note>]]></content-enclosed>
      <created>20240101T100000Z</created>
      <tag>meetings</tag>
    </note>
    <note>
      <title>Retro</title>
      <content-enclosed><![CDATA[<en-note><div>What went well</div></en-note>]]></content-enclosed>
    </note>
  </notebook>
  <notebook>
    <name>Personal</name>
    <note>
      <title>Recipe</title>
      <content-enclosed><![CDATA[<en-note><div>Ingredients</div></en-note>]]></content-enclosed>
    </note>
  </notebook>
</en-export>`;

describe("parseEnexDate", () => {
  it("parses the ENEX timestamp format", () => {
    const parsed = parseEnexDate("20250115T093000Z");
    expect(parsed).toBe(Date.UTC(2025, 0, 15, 9, 30, 0));
  });

  it("returns null for an empty or malformed value", () => {
    expect(parseEnexDate("")).toBeNull();
    expect(parseEnexDate("not a date")).toBeNull();
  });

  it("falls back to Date.parse for other formats", () => {
    expect(parseEnexDate("2025-01-15T09:30:00Z")).toBe(Date.UTC(2025, 0, 15, 9, 30, 0));
  });
});

describe("parseEnex", () => {
  it("extracts title, content, dates and tags", () => {
    const { notes } = parseEnex(SIMPLE);

    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("First note");
    expect(notes[0].html).toContain("Hello");
    expect(notes[0].created).toBe(Date.UTC(2025, 0, 15, 9, 30, 0));
    expect(notes[0].updated).toBe(Date.UTC(2025, 1, 20, 14, 15, 0));
    expect(notes[0].tags).toEqual(["work", "urgent"]);
  });

  it("warns rather than throwing on a note with no content", () => {
    const { notes, warnings } = parseEnex(`<en-export><note><title>Empty</title></note></en-export>`);
    expect(notes).toHaveLength(0);
    expect(warnings[0]).toMatch(/no content/i);
  });

  it("warns when there are no notes at all", () => {
    const { notes, warnings } = parseEnex("<en-export></en-export>");
    expect(notes).toHaveLength(0);
    expect(warnings[0]).toMatch(/No <note> elements/i);
  });

  it("handles an empty <note/> self-closing element", () => {
    const { notes, warnings } = parseEnex("<en-export><note/><note><title>x</title><content-enclosed>y</content-enclosed></note></en-export>");
    expect(notes).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("rejects something that is not XML", () => {
    expect(() => parseEnex("this is not xml at all <<<")).toThrow();
  });

  it("reads escaped entities as well as CDATA", () => {
    const { notes } = parseEnex(
      "<en-export><note><title>Escaped</title><content-enclosed>&lt;div&gt;hi&lt;/div&gt;</content-enclosed></note></en-export>",
    );
    expect(notes[0].html).toContain("div");
  });
});

describe("parseEnexNotebooks", () => {
  it("lifts notes out of their notebooks and records the notebook name", () => {
    const { notes, warnings } = parseEnexNotebooks(WITH_NOTEBOOKS);

    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.title).sort()).toEqual(["Meeting notes", "Recipe", "Retro"]);

    const meeting = notes.find((n) => n.title === "Meeting notes")!;
    expect(meeting.notebook).toBe("Work");
    expect(meeting.tags).toEqual(["meetings"]);

    expect(warnings[0]).toMatch(/3 notes from 2/);
  });

  it("falls back to the flat parse when there are no notebooks", () => {
    const { notes } = parseEnexNotebooks(SIMPLE);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("First note");
  });
});

describe("content field tolerance", () => {
  it("accepts a bare <content> element as well as <content-enclosed>", () => {
    // Some exporters emit the snippet field only.
    const { notes } = parseEnex(
      "<en-export><note><title>Snippet</title><content>partial</content></note></en-export>",
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].html).toBe("partial");
  });

  it("prefers content-enclosed when both are present", () => {
    const { notes } = parseEnex(
      "<en-export><note><title>Both</title><content>snippet</content>" +
        "<content-enclosed>full</content-enclosed></note></en-export>",
    );
    expect(notes[0].html).toBe("full");
  });
});
