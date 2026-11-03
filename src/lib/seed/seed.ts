import type { JSONContent } from "@tiptap/core";
import { db } from "@/lib/db/db";
import type { TombstoneRow } from "@/lib/db/types";
import { toNotebookRow, toNoteRow } from "@/lib/db/convert";
import { getSettings, setSetting } from "@/lib/db/repositories/settings";
import type {
  Attachment,
  Note,
  NoteRow,
  Notebook,
  SampleDataManifest,
  Tag,
} from "@/lib/db/types";
import { code, doc, docToText, h, image, ol, p, pt, quote, table, tasks, text, ul } from "./builders";

/* ------------------------------------------------------------------ */
/* Tombstones for table-clearing paths                                 */
/* ------------------------------------------------------------------ */

/**
 * "Delete everything" also has to mean "delete everything remotely", or the
 * next sync pulls it all back. Record tombstones for the synced tables before
 * clearing them. Join rows are skipped on purpose: deleting a note cascades
 * them server-side.
 */
async function tombstonesForEverything(database: ReturnType<typeof db>): Promise<TombstoneRow[]> {
  const [notebookIds, noteIds, tagIds, attachments] = await Promise.all([
    database.notebooks.toCollection().primaryKeys(),
    database.notes.toCollection().primaryKeys(),
    database.tags.toCollection().primaryKeys(),
    database.attachments.toArray(),
  ]);
  const deletedAt = Date.now();
  return [
    ...notebookIds.map((id) => ({ key: `notebooks:${id}`, table: "notebooks" as const, ref: id, deletedAt })),
    ...noteIds.map((id) => ({ key: `notes:${id}`, table: "notes" as const, ref: id, deletedAt })),
    ...tagIds.map((id) => ({ key: `tags:${id}`, table: "tags" as const, ref: id, deletedAt })),
    ...attachments.map((attachment) => ({
      key: `attachments:${attachment.id}|${attachment.fileName}`,
      table: "attachments" as const,
      ref: `${attachment.id}|${attachment.fileName}`,
      deletedAt,
    })),
  ];
}

/* ------------------------------------------------------------------ */
/* Wipe                                                               */
/* ------------------------------------------------------------------ */

/** Destroy every table. Used by "delete sample data" and by settings. */
export async function wipeAllData(): Promise<void> {
  const database = db();
  await database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.tags,
      database.noteTags,
      database.attachments,
      database.versions,
      // Dexie refuses to touch a table the transaction did not declare, and
      // noteLinks is now a table.
      database.noteLinks,
      database.settings,
      database.tombstones,
    ],
    async () => {
      await database.tombstones.bulkPut(await tombstonesForEverything(database));
      await Promise.all([
        database.notebooks.clear(),
        database.notes.clear(),
        database.tags.clear(),
        database.noteTags.clear(),
        database.attachments.clear(),
        database.versions.clear(),
        database.noteLinks.clear(),
        database.settings.clear(),
      ]);
    },
  );
}

/** A tiny read model for the onboarding preview. */
export interface SamplePreview {
  notes: { id: string; title: string; excerpt: string; notebook: string }[];
  noteCount: number;
  notebookCount: number;
  tagCount: number;
  attachmentCount: number;
}

const EMPTY_PREVIEW: SamplePreview = {
  notes: [],
  noteCount: 0,
  notebookCount: 0,
  tagCount: 0,
  attachmentCount: 0,
};

/** What the sample set currently looks like, for the first-run preview. */
export async function getSamplePreview(): Promise<SamplePreview> {
  const database = db();
  const { sampleData } = await getSettings();
  const manifest = sampleData ?? (await legacySampleManifest(database));
  if (manifest === null || manifest.noteIds.length === 0) return EMPTY_PREVIEW;

  const [noteRows, notebookRows] = await Promise.all([
    database.notes.bulkGet(manifest.noteIds),
    database.notebooks.bulkGet(manifest.notebookIds),
  ]);
  const live = noteRows.filter(
    (row): row is NoteRow => row !== undefined && row.isTrashed === 0,
  );
  const notebookNames = new Map(
    notebookRows.filter((row) => row !== undefined).map((row) => [row.id, row.name]),
  );

  return {
    notes: live.slice(0, 3).map((row) => ({
      id: row.id,
      title: row.title,
      excerpt: row.contentText.slice(0, 120),
      notebook: notebookNames.get(row.notebookId) ?? "Unfiled",
    })),
    noteCount: live.length,
    notebookCount: manifest.notebookIds.length,
    tagCount: manifest.tagIds.length,
    attachmentCount: manifest.attachmentIds.length,
  };
}

/** Remove the sample content but keep the user's profile and preferences. */
export async function removeSampleData(): Promise<void> {
  const database = db();
  const { sampleData } = await getSettings();
  const manifest = sampleData ?? (await legacySampleManifest(database));
  if (manifest === null) return;

  const noteIds = manifest.noteIds;
  const attachments =
    noteIds.length === 0
      ? []
      : await database.attachments.where("noteId").anyOf(noteIds).toArray();
  const deletedAt = Date.now();

  const noteTombstones: TombstoneRow[] = [
    ...manifest.noteIds.map((id) => ({
      key: `notes:${id}`,
      table: "notes" as const,
      ref: id,
      deletedAt,
    })),
    ...attachments.map((attachment) => ({
      key: `attachments:${attachment.id}|${attachment.fileName}`,
      table: "attachments" as const,
      ref: `${attachment.id}|${attachment.fileName}`,
      deletedAt,
    })),
  ];

  await database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.tags,
      database.noteTags,
      database.attachments,
      database.versions,
      database.noteLinks,
      database.tombstones,
    ],
    async () => {
      if (noteTombstones.length > 0) {
        await database.tombstones.bulkPut(noteTombstones);
      }

      if (noteIds.length > 0) {
        await database.versions.where("noteId").anyOf(noteIds).delete();
        await database.noteLinks.where("sourceId").anyOf(noteIds).delete();
        await database.noteTags.where("noteId").anyOf(noteIds).delete();
        await database.attachments.where("noteId").anyOf(noteIds).delete();
        await database.notes.bulkDelete(noteIds);
      }

      if (manifest.notebookIds.length > 0) {
        // Keep a sample notebook when the user put their own notes or child
        // notebooks in it. Deleting only the empty ones is what makes this
        // safe to run long after onboarding.
        const remainingNotes = await database.notes
          .where("notebookId")
          .anyOf(manifest.notebookIds)
          .toArray();
        const used = new Set(remainingNotes.map((note) => note.notebookId));
        const sampleNotebooks = new Set(manifest.notebookIds);
        const children = await database.notebooks
          .where("parentId")
          .anyOf(manifest.notebookIds)
          .toArray();
        // A sample parent may still have a sample child; both are in the
        // manifest and both should go. Only a *user-created* child keeps it.
        const hasUserChild = new Set(
          children
            .filter((child) => !sampleNotebooks.has(child.id))
            .map((child) => child.parentId),
        );
        const removable = manifest.notebookIds.filter(
          (id) => !used.has(id) && !hasUserChild.has(id),
        );
        if (removable.length > 0) {
          await database.notebooks.bulkDelete(removable);
          await database.tombstones.bulkPut(
            removable.map((id) => ({
              key: `notebooks:${id}`,
              table: "notebooks" as const,
              ref: id,
              deletedAt,
            })),
          );
        }
      }

      if (manifest.tagIds.length > 0) {
        const remainingLinks = await database.noteTags
          .where("tagId")
          .anyOf(manifest.tagIds)
          .toArray();
        const used = new Set(remainingLinks.map((link) => link.tagId));
        const removable = manifest.tagIds.filter((id) => !used.has(id));
        if (removable.length > 0) {
          await database.tags.bulkDelete(removable);
          await database.tombstones.bulkPut(
            removable.map((id) => ({
              key: `tags:${id}`,
              table: "tags" as const,
              ref: id,
              deletedAt,
            })),
          );
        }
      }
    },
  );

  const settings = await getSettings();
  const lastNotebook =
    settings.lastNotebookId === null
      ? null
      : await database.notebooks.get(settings.lastNotebookId);
  await setSetting("sampleData", null);
  if (settings.lastNotebookId !== null && lastNotebook === undefined) {
    await setSetting("lastNotebookId", null);
  }
  await setSetting("dataVersion", settings.dataVersion + 1);
}

/**
 * Manifest for databases seeded before `sampleData` was tracked (0.0.1).
 *
 * Matching is deliberately conservative: exact seed titles only, notebooks
 * only when every note inside belongs to the sample set, and tags only when
 * every link points at one. A user's note is never deleted by a fuzzy match;
 * at worst a renamed sample note is left behind.
 */
async function legacySampleManifest(
  database: ReturnType<typeof db>,
): Promise<SampleDataManifest | null> {
  const seedTitles = new Set(SEED_NOTES.map((note) => note.title));
  const notes = await database.notes.toArray();
  const noteIds = notes
    .filter((note) => seedTitles.has(note.title))
    .map((note) => note.id);
  if (noteIds.length === 0) return null;

  const sampleNotes = new Set(noteIds);
  const [attachments, notebooks, tags, noteTags] = await Promise.all([
    database.attachments.toArray(),
    database.notebooks.toArray(),
    database.tags.toArray(),
    database.noteTags.toArray(),
  ]);

  const seedNotebookNames = new Set(NOTEBOOKS.map((notebook) => notebook.name));
  const notebookIds = notebooks
    .filter((notebook) => {
      if (!seedNotebookNames.has(notebook.name)) return false;
      const contents = notes.filter((note) => note.notebookId === notebook.id);
      return contents.every((note) => sampleNotes.has(note.id));
    })
    .map((notebook) => notebook.id);

  const tagIds = tags
    .filter((tag) => {
      const links = noteTags.filter((link) => link.tagId === tag.id);
      return links.length > 0 && links.every((link) => sampleNotes.has(link.noteId));
    })
    .map((tag) => tag.id);

  const attachmentIds = attachments
    .filter((attachment) => sampleNotes.has(attachment.noteId))
    .map((attachment) => attachment.id);

  return { noteIds, notebookIds, tagIds, attachmentIds };
}

/** Clear every content table but keep settings. Used by "restore samples". */
async function clearAllContent(): Promise<void> {
  const database = db();
  await database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.tags,
      database.noteTags,
      database.attachments,
      database.versions,
      database.noteLinks,
      database.tombstones,
    ],
    async () => {
      await database.tombstones.bulkPut(await tombstonesForEverything(database));
      await Promise.all([
        database.notebooks.clear(),
        database.notes.clear(),
        database.tags.clear(),
        database.noteTags.clear(),
        database.attachments.clear(),
        database.versions.clear(),
        database.noteLinks.clear(),
      ]);
    },
  );
  await setSetting("lastNotebookId", null);
  await setSetting("dataVersion", (await getSettings()).dataVersion + 1);
}

/* ------------------------------------------------------------------ */
/* Sample image                                                        */
/* ------------------------------------------------------------------ */

const SAMPLE_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="55%" stop-color="#db2777"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="600" fill="url(#g)"/>
  <text x="60" y="330" font-family="system-ui, sans-serif" font-size="64" font-weight="600" fill="#ffffff">
    Local-first notes
  </text>
  <text x="60" y="400" font-family="system-ui, sans-serif" font-size="32" fill="#ffffff" opacity="0.85">
    Everything stays in this browser.
  </text>
</svg>`;


/* ------------------------------------------------------------------ */
/* Seed content                                                        */
/* ------------------------------------------------------------------ */

interface SeedNote {
  title: string;
  notebook: string;
  content: JSONContent;
  markdown: string;
  tags: string[];
  pinned?: boolean;
  attachments?: { fileName: string }[];
}

const WELCOME: SeedNote = {
  title: "Welcome to your notes",
  notebook: "Inbox",
  pinned: true,
  tags: ["getting-started"],
  content: doc(
    h(1, "Welcome"),
    pt("This is a local-first notes app. Everything you type is stored in this browser first — no account required. If this deployment enables sync, signing in uploads your notes so they can reach your other devices."),
    h(2, "The three panes"),
    ul(
      "Left: notebooks, nested as deep as you like.",
      "Middle: the notes in the selected notebook.",
      "Right: the editor, with a raw Markdown view behind the toggle.",
    ),
    h(2, "Things worth trying"),
    tasks(
      ["Create a notebook, then drag another one inside it", false],
      ["Write a note and switch to the Markdown view", false],
      ["Attach an image by pasting it straight from your clipboard", false],
      ["Restore an earlier version from the note menu", false],
    ),
    h(2, "The one thing to know"),
    quote(
      "Browser storage can be cleared by the operating system when space runs low. Export a ZIP backup from Settings regularly — it is the one copy you hold yourself.",
    ),
  ),
  markdown: `# Welcome

This is a local-first notes app. Everything you type is stored in this browser first — no account required. If this deployment enables sync, signing in uploads your notes so they can reach your other devices.

## The three panes

- Left: notebooks, nested as deep as you like.
- Middle: the notes in the selected notebook.
- Right: the editor, with a raw Markdown view behind the toggle.

## Things worth trying

- [ ] Create a notebook, then drag another one inside it
- [ ] Write a note and switch to the Markdown view
- [ ] Attach an image by pasting it straight from your clipboard
- [ ] Restore an earlier version from the note menu

## The one thing to know

> Browser storage can be cleared by the operating system when space runs low. Export a ZIP backup from Settings regularly — it is the one copy you hold yourself.
`,
};

const LOCAL_FIRST: SeedNote = {
  title: "Why local-first",
  notebook: "Ideas",
  tags: ["architecture", "getting-started"],
  content: doc(
    h(1, "Why local-first"),
    pt("This app keeps your notes in the browser first and treats a server as optional. That order matters: editing never waits on the network, and an account only ever adds sync and sharing."),
    h(2, "What you give up"),
    ul(
      "Browser storage can be evicted under disk pressure — persist it from the sidebar.",
      "Without an account, notes live only on this device.",
      "A shared link shows a snapshot; anyone with the link can read it until you revoke it.",
    ),
    h(2, "What you get"),
    ul(
      "It works offline, always, with no sync loop in the edit path.",
      "It is fast because there is no network round-trip while typing.",
      "Sync and share links when you want them, against a server you control.",
      "A ZIP backup you hold yourself, independent of any account.",
    ),
    h(2, "Side by side"),
    table(
      ["", "Without an account", "Signed in"],
      [
        ["Where notes live", "This browser only", "This browser + your server"],
        ["Other devices", "No", "Synced"],
        ["Share links", "No", "Yes, revocable"],
        ["Backup", "ZIP from Settings", "ZIP, plus your server"],
      ],
    ),
    quote("Local-first is a promise about where your data lives first — not about whether it can leave."),
  ),
  markdown: `# Why local-first

This app keeps your notes in the browser first and treats a server as optional. That order matters: editing never waits on the network, and an account only ever adds sync and sharing.

## What you give up

- Browser storage can be evicted under disk pressure — persist it from the sidebar.
- Without an account, notes live only on this device.
- A shared link shows a snapshot; anyone with the link can read it until you revoke it.

## What you get

- It works offline, always, with no sync loop in the edit path.
- It is fast because there is no network round-trip while typing.
- Sync and share links when you want them, against a server you control.
- A ZIP backup you hold yourself, independent of any account.

## Side by side

| | Without an account | Signed in |
| --- | --- | --- |
| Where notes live | This browser only | This browser + your server |
| Other devices | No | Synced |
| Share links | No | Yes, revocable |
| Backup | ZIP from Settings | ZIP, plus your server |

> Local-first is a promise about where your data lives first — not about whether it can leave.
`,
};

const TYPESCRIPT: SeedNote = {
  title: "TypeScript notes",
  notebook: "Work/Engineering",
  tags: ["reference", "code"],
  content: doc(
    h(1, "TypeScript notes"),
    h(2, "A type guard that actually narrows"),
    p(
      text("function isNotebook(value: unknown): value is Notebook {"),
      text("  return typeof value === 'object' && value !== null && 'parentId' in value;"),
    ),
    p(text("}")),
    h(2, "IndexedDB cannot index booleans"),
    p(
      text("Valid IndexedDB keys are numbers, strings, dates, binary and arrays. "),
      text("A boolean column simply will not appear in an index", [{ type: "bold" }]),
      text(", so a flag that needs querying has to be stored as "),
      text("0 | 1", [{ type: "code" }]),
      text("."),
    ),
    code(
      `// Storing a boolean and then wondering why the index is empty
const rows = await db().notes.where("isTrashed").equals(false); // never matches

// Store the flag as a number
const rows = await db().notes.where("isTrashed").equals(0);   // works`,
      "typescript",
    ),
    h(2, "Checklist"),
    tasks(
      ["Narrow with a type predicate, not a cast", true],
      ["Prefer a union of literals over a bare string", true],
      ["Derive, do not duplicate — store the source of truth and compute the rest", false],
    ),
  ),
  markdown: `# TypeScript notes

## A type guard that actually narrows

\`\`\`typescript
function isNotebook(value: unknown): value is Notebook {
  return typeof value === 'object' && value !== null && 'parentId' in value;
}
\`\`\`

## IndexedDB cannot index booleans

Valid IndexedDB keys are numbers, strings, dates, binary and arrays. A boolean column simply will not appear in an index, so a flag that needs querying has to be stored as \`0 | 1\`.

\`\`\`typescript
// Storing a boolean and then wondering why the index is empty
const rows = await db().notes.where("isTrashed").equals(false); // never matches

// Store the flag as a number
const rows = await db().notes.where("isTrashed").equals(0);   // works
\`\`\`

## Checklist

- [x] Narrow with a type predicate, not a cast
- [x] Prefer a union of literals over a bare string
- [ ] Derive, do not duplicate — store the source of truth and compute the rest
`,
};

const ROADMAP: SeedNote = {
  title: "Roadmap",
  notebook: "Work",
  tags: ["planning"],
  pinned: true,
  content: doc(
    h(1, "Roadmap"),
    h(2, "Now"),
    ol("Three-pane workspace and notebook tree", "Editor with Markdown view", "Tags, search and trash"),
    h(2, "Next"),
    ol("Attachments with client-side compression", "Version history", "ZIP export and import"),
    h(2, "Later"),
    ol("Self-hosted Supabase backend", "Real public share links", "Multi-device sync"),
  ),
  markdown: `# Roadmap

## Now

1. Three-pane workspace and notebook tree
2. Editor with Markdown view
3. Tags, search and trash

## Next

1. Attachments with client-side compression
2. Version history
3. ZIP export and import

## Later

1. Self-hosted Supabase backend
2. Real public share links
3. Multi-device sync
`,
};

const READING: SeedNote = {
  title: "Reading list",
  notebook: "Personal/Reading",
  tags: ["reading"],
  content: doc(
    h(1, "Reading list"),
    ul(
      "Designing Data-Intensive Applications — Martin Kleppmann",
      "The Timeless Way of Building — Christopher Alexander",
      "A Philosophy of Software Design — John Ousterhout",
    ),
    quote("Read one of these properly rather than three of them shallowly."),
  ),
  markdown: `# Reading list

- Designing Data-Intensive Applications — Martin Kleppmann
- The Timeless Way of Building — Christopher Alexander
- A Philosophy of Software Design — John Ousterhout

> Read one of these properly rather than three of them shallowly.
`,
};

const PHOTO: SeedNote = {
  title: "Image test",
  notebook: "Inbox",
  tags: ["attachments"],
  content: doc(
    pt("Attachments are stored as blobs in IndexedDB. Pasted images are re-encoded to WebP with the longest edge capped at 2560px before they are written."),
    image({ src: "__attachment__", alt: "Gradient sample" }),
    pt("The image above was generated locally at seed time — no network request was made."),
  ),
  markdown: `# Image test

Attachments are stored as blobs in IndexedDB. Pasted images are re-encoded to WebP with the longest edge capped at 2560px before they are written.

![Gradient sample](attachment://gradient)

The image above was generated locally at seed time — no network request was made.
`,
  attachments: [{ fileName: "gradient.svg" }],
};

const SEED_NOTES: SeedNote[] = [WELCOME, PHOTO, ROADMAP, LOCAL_FIRST, TYPESCRIPT, READING];

const NOTEBOOKS: { name: string; parent: string | null }[] = [
  { name: "Inbox", parent: null },
  { name: "Work", parent: null },
  { name: "Engineering", parent: "Work" },
  { name: "Personal", parent: null },
  { name: "Reading", parent: "Personal" },
  { name: "Ideas", parent: null },
];

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

export interface SeedResult {
  notebooks: number;
  notes: number;
  tags: number;
}

/**
 * In-flight seed, shared by concurrent callers.
 *
 * `seedIfEmpty` is reachable from more than one place at once: React StrictMode
 * runs mount effects twice in development, and a second browser tab bootstraps
 * independently. Both callers read `seeded === false` before either has written
 * it, and both proceed — the second one's `noteTags` write then collides with
 * the first's on the unique `[noteId+tagId]` index and the whole app fails to
 * open with `ConstraintError`.
 *
 * Deduplicating here rather than at the call site fixes every caller at once,
 * and keeps the invariant with the code that enforces it.
 */
let inFlight: Promise<SeedResult | null> | null = null;

/**
 * Populate the database with sample content. Idempotent: does nothing if the
 * database already holds notes, so a reload never duplicates anything.
 */
export async function seedIfEmpty(): Promise<SeedResult | null> {
  if (inFlight !== null) return inFlight;

  inFlight = runSeed().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSeed(): Promise<SeedResult | null> {
  const database = db();
  const existing = await database.notes.count();
  if (existing > 0) return null;

  const { seeded } = await getSettings();
  if (seeded) return null;

  const timestamp = Date.now();

  const notebookRows: Notebook[] = NOTEBOOKS.map((entry, index) => ({
    // Sample data syncs like any other data, so ids must be UUIDs.
    id: crypto.randomUUID(),
    parentId: null,
    name: entry.name,
    position: index,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  // Resolve parent references by name, now that ids exist.
  for (const entry of NOTEBOOKS) {
    if (entry.parent === null) continue;
    const row = notebookRows.find((n) => n.name === entry.name);
    if (!row) continue;
    row.parentId = notebookRows.find((n) => n.name === entry.parent)?.id ?? null;
  }

  const byName = new Map(notebookRows.map((n) => [n.name, n]));
  const tagColors = ["violet", "amber", "emerald", "rose", "sky"];

  const noteRows: Note[] = [];
  const tagRows: Tag[] = [];
  const linkRows: { id: string; noteId: string; tagId: string }[] = [];
  const attachmentRows: Attachment[] = [];

  SEED_NOTES.forEach((seed, index) => {
    const id = crypto.randomUUID();
    const notebook = byName.get(seed.notebook);
    const createdAt = timestamp - (SEED_NOTES.length - index) * 86_400_000;

    noteRows.push({
      id,
      notebookId: notebook?.id ?? null,
      title: seed.title,
      contentJson: seed.content,
      contentMarkdown: seed.markdown,
      contentText: docToText(seed.content),
      isPinned: seed.pinned ?? false,
      isTrashed: false,
      trashedAt: null,
      version: 1,
      createdAt,
      updatedAt: createdAt + 3_600_000,
    });

    for (const name of seed.tags) {
      const normalized = name.toLowerCase();

      // One tag row per name, reused by every note that carries it; link rows
      // reference it. (The previous deterministic id reused across notes is
      // why a tag could not simply be regenerated per note.)
      let tagRow = tagRows.find((tag) => tag.name === normalized);
      if (tagRow === undefined) {
        tagRow = {
          id: crypto.randomUUID(),
          name: normalized,
          color: tagColors[tagRows.length % tagColors.length],
          createdAt,
        };
        tagRows.push(tagRow);
      }

      linkRows.push({ id: crypto.randomUUID(), noteId: id, tagId: tagRow.id });
    }

    for (const attachment of seed.attachments ?? []) {
      attachmentRows.push({
        id: crypto.randomUUID(),
        noteId: id,
        fileName: attachment.fileName,
        mime: "image/svg+xml",
        size: SAMPLE_IMAGE_SVG.length,
        width: 1200,
        height: 600,
        data: new TextEncoder().encode(SAMPLE_IMAGE_SVG),
        createdAt,
      });
    }
  });

  await database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.tags,
      database.noteTags,
      database.attachments,
    ],
    async () => {
      await database.notebooks.bulkPut(notebookRows.map(toNotebookRow));
      await database.notes.bulkPut(noteRows.map(toNoteRow));
      await database.tags.bulkPut(tagRows);
      await database.noteTags.bulkPut(linkRows);
      await database.attachments.bulkPut(attachmentRows);
    },
  );

  // Links are written directly rather than through `setNoteTags`, so the seed
  // does not have to re-read every tag it just inserted.

  await setSetting("seeded", true);
  await setSetting("dataVersion", 1);
  // Recorded so "remove sample data" can delete only what this run created.
  await setSetting("sampleData", {
    noteIds: noteRows.map((note) => note.id),
    notebookIds: notebookRows.map((notebook) => notebook.id),
    tagIds: tagRows.map((tag) => tag.id),
    attachmentIds: attachmentRows.map((attachment) => attachment.id),
  });
  // A fresh database gets the tour. Restoring samples later clears this again.
  await setSetting("onboardingPending", true);
  if (byName.has("Inbox")) await setSetting("lastNotebookId", byName.get("Inbox")!.id);

  return { notebooks: notebookRows.length, notes: noteRows.length, tags: tagRows.length };
}

export type { Note, SeedNote };

/**
 * Put the sample content back.
 *
 * Wipes content but keeps the profile and preferences, then re-seeds. The
 * inverse of `removeSampleData` and backs the sidebar's "Reset sample data"
 * action. This is the one deliberate full wipe, so users who ask for the
 * samples back get a clean set rather than a merge.
 */
export async function restoreSampleData(): Promise<SeedResult> {
  await clearAllContent();
  await setSetting("sampleData", null);

  // `removeSampleData` keeps the `seeded` flag on purpose, so deleting the
  // samples does not bring them back on the next reload. An explicit reset is
  // the one case where the user *is* asking for them back, so the flag has to
  // go — otherwise `seedIfEmpty` correctly declines and does nothing.
  await setSetting("seeded", false);

  const result = await seedIfEmpty();
  if (result === null) throw new Error("Sample data could not be restored");
  // Replaying the samples is not a first run; do not reopen the tour.
  await setSetting("onboardingPending", false);
  return result;
}
