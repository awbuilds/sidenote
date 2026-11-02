import { XMLParser } from "fast-xml-parser";

/**
 * Evernote ENEX import.
 *
 * ENEX is a nested XML export. The awkward parts are all in `content-enclosed`
 * (CDATA holding full HTML, which may be a whole note in one tag, a fragment,
 * or base64), and `<note>` having no children at all when empty — fast-xml-parser
 * then hands back an empty string instead of an object.
 *
 * The HTML is converted by the caller, which parses it into TipTap nodes.
 */

export interface EnexNote {
  title: string;
  /** Raw HTML from `content-enclosed`. */
  html: string;
  created: number | null;
  updated: number | null;
  tags: string[];
  notebook: string | null;
}

export interface EnexResult {
  notes: EnexNote[];
  warnings: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // ENEX mixes CDATA and escaped entities inside the same fields.
  cdataPropName: "__cdata",
  parseTagValue: false,
  trimValues: false,
  // Resource elements are enormous and unused; do not build them.
  alwaysCreateTextNode: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Read a field that may be a string, a CDATA wrapper, or a single object. */
function field(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node !== "object") return String(node).trim();

  const record = node as Record<string, unknown>;
  if (typeof record.__cdata === "string") return record.__cdata.trim();
  if (typeof record["#text"] === "string") return record["#text"].trim();
  return "";
}

/** ENEX timestamps are `20200115T093000Z`. */
export function parseEnexDate(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(trimmed);
  if (match === null) {
    const fallback = Date.parse(trimmed);
    return Number.isNaN(fallback) ? null : fallback;
  }

  const [, year, month, day, hour, minute, second] = match;
  const parsed = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseEnex(xml: string): EnexResult {
  const warnings: string[] = [];
  const notes: EnexNote[] = [];

  let tree: Record<string, unknown>;
  try {
    tree = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new Error("That file is not valid ENEX XML.");
  }

  // `<en-export></en-export>` parses to an empty string rather than an object,
  // and that is a valid (if useless) export — warn rather than throw.
  const candidate = (tree["en-export"] ?? tree["en-note"] ?? tree) as unknown;
  const root: Record<string, unknown> =
    typeof candidate === "object" && candidate !== null
      ? (candidate as Record<string, unknown>)
      : {};

  if (Object.keys(root).length === 0 && Object.keys(tree).length > 1) {
    throw new Error("That file does not look like an Evernote ENEX export.");
  }

  const rawNotes = asArray(root.note as unknown[]);
  if (rawNotes.length === 0) {
    warnings.push("No <note> elements were found in this export.");
  }

  rawNotes.forEach((raw, index) => {
    if (raw === undefined || raw === null || typeof raw !== "object") {
      warnings.push(`Note ${index + 1} was empty and was skipped.`);
      return;
    }

    const note = raw as Record<string, unknown>;
    const title = field(note.title) || "Untitled note";
    // `content-enclosed` is the full note; `content` is the snippet field some
    // exporters emit instead. Prefer the former, accept the latter.
    const html = field(note["content-enclosed"]) || field(note.content);

    if (html === "") {
      warnings.push(`"${title}" has no content and was skipped.`);
      return;
    }

    // A note can declare its notebook on itself, or inherit from the enclosing
    // <notebook>; both are handled by the caller via this field.
    const notebook = field(note.notebook) || null;

    notes.push({
      title,
      html,
      created: parseEnexDate(field(note.created)),
      updated: parseEnexDate(field(note.updated)),
      tags: asArray(note.tag as unknown[])
        .map((tag) => field(tag))
        .filter((name) => name !== ""),
      notebook,
    });
  });

  return { notes, warnings };
}

/**
 * ENEX nests notes inside `<notebook>`. This lifts them out, attaching the
 * notebook name to each, so a flat parse is enough.
 */
export function parseEnexNotebooks(xml: string): EnexResult {
  const base = parseEnex(xml);

  let tree: Record<string, unknown>;
  try {
    tree = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return base;
  }

  const root = (tree["en-export"] ?? {}) as Record<string, unknown>;
  const notebooks = asArray(root.notebook as unknown[]);

  if (notebooks.length === 0) return base;

  const warnings: string[] = [];
  const notes: EnexNote[] = [];

  for (const rawNotebook of notebooks) {
    if (rawNotebook === null || typeof rawNotebook !== "object") continue;
    const notebook = rawNotebook as Record<string, unknown>;
    const name = field(notebook.name) || "Imported";

    for (const rawNote of asArray(notebook.note as unknown[])) {
      if (rawNote === null || typeof rawNote !== "object") continue;
      const note = rawNote as Record<string, unknown>;
      const html = field(note["content-enclosed"]) || field(note.content);
      if (html === "") continue;

      notes.push({
        title: field(note.title) || "Untitled note",
        html,
        created: parseEnexDate(field(note.created)),
        updated: parseEnexDate(field(note.updated)),
        tags: asArray(note.tag as unknown[])
          .map((tag) => field(tag))
          .filter((n) => n !== ""),
        notebook: name,
      });
    }
  }

  if (notes.length === 0) {
    // No notebook-nested notes; the flat pass already handled it.
    return base;
  }

  warnings.push(
    `Imported ${notes.length} notes from ${notebooks.length} Evernote notebook(s).`,
  );
  return { notes, warnings };
}
