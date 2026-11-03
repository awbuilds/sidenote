"use client";

import { toast } from "sonner";

import { db } from "@/lib/db/db";
import { createNotebook } from "@/lib/db/repositories/notebooks";
import { createNote } from "@/lib/db/repositories/notes";
import { setNoteTags } from "@/lib/db/repositories/tags";
import { touchDataVersion } from "@/lib/db/repositories/settings";
import { markSearchFullRebuild } from "@/lib/search/dirty";
import { fromMarkdown, toMarkdown } from "@/lib/tiptap/markdown";
import { docToText } from "@/lib/tiptap/doc";
import { parseEnexNotebooks } from "./enex";

export interface EnexImportResult {
  notebooks: number;
  notes: number;
  warnings: string[];
}

/**
 * Evernote ENEX import.
 *
 * ENEX content is HTML inside CDATA. There is no HTML -> TipTap converter
 * here, so the HTML is stripped to Markdown by the browser's own parser: a
 * real DOMParser is available in the browser, and this keeps the dependency
 * surface small at the cost of a lossy import.
 *
 * Lossiness is reported rather than hidden — an ENEX import is a migration,
 * not a sync, and the user should know what to check.
 */
export async function importEnex(file: File): Promise<EnexImportResult> {
  const xml = await file.text();
  const { notes: parsed, warnings } = parseEnexNotebooks(xml);

  if (parsed.length === 0) {
    toast.error("No importable notes found", {
      description: warnings[0] ?? "This file contained no notes with content.",
    });
    return { notebooks: 0, notes: 0, warnings };
  }

  const notebookIds = new Map<string, string>();
  const createdNotes: string[] = [];
  const now = Date.now();

  for (const [index, note] of parsed.entries()) {
    let notebookId: string | null = null;
    if (note.notebook !== null) {
      const existing = notebookIds.get(note.notebook);
      if (existing !== undefined) {
        notebookId = existing;
      } else {
        const created = await createNotebook({ name: note.notebook });
        notebookIds.set(note.notebook, created.id);
        notebookId = created.id;
      }
    }

    const markdown = htmlToMarkdown(note.html);
    const doc = fromMarkdown(markdown);

    const created = await createNote({ notebookId, title: note.title });
    // Backdate to Evernote's own timestamps where we have them.
    const createdAt = note.created ?? now - (parsed.length - index) * 1000;
    await db().notes.update(created.id, {
      contentJson: doc,
      contentMarkdown: toMarkdown(doc),
      contentText: docToText(doc),
      createdAt,
      updatedAt: note.updated ?? createdAt,
    });

    if (note.tags.length > 0) {
      await setNoteTags(created.id, note.tags);
    }
    createdNotes.push(created.id);
  }

  await touchDataVersion();
  markSearchFullRebuild();

  const summary = `Imported ${createdNotes.length} note${createdNotes.length === 1 ? "" : "s"} from Evernote.`;
  toast.success(summary, {
    description: warnings.length > 0 ? warnings.join(" ") : undefined,
  });

  return { notebooks: notebookIds.size, notes: createdNotes.length, warnings };
}

/** Strip an ENEX HTML fragment to Markdown using the browser's own parser. */
export function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]+>/g, " ").trim();

  const doc = new DOMParser().parseFromString(html, "text/html");
  return nodeToMarkdown(doc.body);
}

const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "TR", "BR", "H1", "H2", "H3", "H4", "H5", "H6",
  "BLOCKQUOTE", "PRE", "UL", "OL", "TABLE",
]);

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(nodeToMarkdown).join("");
  }

  const tag = node.tagName;
  const inner = Array.from(node.childNodes).map(nodeToMarkdown).join("").trim();

  switch (tag) {
    case "B":
    case "STRONG":
      return inner === "" ? "" : `**${inner}**`;
    case "I":
    case "EM":
      return inner === "" ? "" : `*${inner}*`;
    case "CODE":
      return inner === "" ? "" : `\`${inner}\``;
    case "PRE":
      return `\n\`\`\`\n${inner}\n\`\`\`\n`;
    case "H1":
      return `\n# ${inner}\n`;
    case "H2":
      return `\n## ${inner}\n`;
    case "H3":
      return `\n### ${inner}\n`;
    case "H4":
    case "H5":
    case "H6":
      return `\n#### ${inner}\n`;
    case "BLOCKQUOTE":
      return `\n> ${inner}\n`;
    case "A": {
      const href = node.getAttribute("href");
      return href === null || inner === "" ? inner : `[${inner}](${href})`;
    }
    case "LI": {
      const parent = node.parentElement;
      const ordered = parent?.tagName === "OL";
      return `\n${ordered ? "1." : "-"} ${inner}`;
    }
    case "IMG": {
      const src = node.getAttribute("src");
      return src === null ? "" : `![${node.getAttribute("alt") ?? ""}](${src})`;
    }
    case "HR":
      return "\n---\n";
    default:
      return BLOCK_TAGS.has(tag) ? `\n${inner}\n` : inner;
  }
}

/** Read a picked File, with a size guard — ENEX exports can be enormous. */
export async function readImportFile(file: File, maxBytes = 200 * 1024 * 1024): Promise<File> {
  if (file.size > maxBytes) {
    throw new Error(
      `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB, over the import limit.`,
    );
  }
  return file;
}
