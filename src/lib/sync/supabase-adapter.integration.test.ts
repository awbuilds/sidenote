import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/db";
import { withTestDb } from "@/lib/db/test-helpers";
import { createNotebook } from "@/lib/db/repositories/notebooks";
import { createNote, purgeNotes } from "@/lib/db/repositories/notes";
import { createTag, setNoteTags } from "@/lib/db/repositories/tags";
import { addAttachment } from "@/lib/db/repositories/attachments";
import { reconcile } from "./engine";
import { createSupabaseAdapter } from "./supabase-adapter";

/**
 * Runs only when the three env vars are present, e.g.
 *
 *   SUPABASE_TEST_URL=http://127.0.0.1:9020 \
 *   SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_KEY=... \
 *   npx vitest run src/lib/sync/supabase-adapter.integration.test.ts
 *
 * The unit suite uses an in-memory fake; this is the only test that proves the
 * real PostgREST adapter, RLS policies and triggers accept what the engine
 * sends. It is skipped in ordinary runs on purpose — CI has no stack.
 */
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_KEY;
const enabled = Boolean(url && anonKey && serviceKey);

describe.skipIf(!enabled)("supabase adapter (integration)", () => {
  withTestDb();

  it(
    "round-trips local rows through PostgREST, RLS and cascade delete",
    async () => {
      const admin = createClient(url!, serviceKey!);
      const email = `integration-${Date.now()}@sidenote.local`;
      const password = `pw-${crypto.randomUUID()}`;

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      expect(createError).toBeNull();
      const userId = created!.user!.id;

      const client = createClient(url!, anonKey!);
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      expect(signInError).toBeNull();

      try {
        const notebook = await createNotebook({ name: "Integration notebook" });
        const tag = await createTag("integration");
        const note = await createNote({
          notebookId: notebook.id,
          title: "Integration note",
          contentText: "integration body",
        });
        await setNoteTags(note.id, ["integration"]);

        const first = await reconcile(createSupabaseAdapter(client, userId));
        expect(first.pushed).toBeGreaterThanOrEqual(4);

        const { data: remoteNote, error: readError } = await client
          .from("notes")
          .select("id, user_id, title, content_text")
          .eq("id", note.id)
          .single();
        expect(readError).toBeNull();
        if (!remoteNote) throw new Error("remote note missing after push");
        expect(remoteNote.title).toBe("Integration note");
        expect(remoteNote.user_id).toBe(userId);

        const { data: remoteLink } = await client
          .from("note_tags")
          .select("note_id, tag_id")
          .eq("note_id", note.id)
          .maybeSingle();
        expect(remoteLink?.tag_id).toBe(tag.id);

        // Attachment bytes round-trip through Storage + the metadata table.
        const attachment = await addAttachment({
          noteId: note.id,
          fileName: "integration.png",
          mime: "image/png",
          blob: new Blob([new Uint8Array([7, 7, 7])], { type: "image/png" }),
        });
        await reconcile(createSupabaseAdapter(client, userId));

        const { data: remoteAttachment, error: attachmentError } = await client
          .from("attachments")
          .select("path, size_bytes")
          .eq("id", attachment.id)
          .single();
        expect(attachmentError).toBeNull();
        expect(remoteAttachment?.size_bytes).toBe(3);

        const { data: signed } = await client.storage
          .from("attachments")
          .createSignedUrl(remoteAttachment!.path!, 60);
        const downloaded = new Uint8Array(
          await (await fetch(signed!.signedUrl)).arrayBuffer(),
        );
        expect(Array.from(downloaded)).toEqual([7, 7, 7]);

        // Free-tier quota: an oversized row is rejected by the trigger.
        const { error: quotaError } = await admin.from("attachments").insert({
          user_id: userId,
          note_id: note.id,
          path: "quota-check",
          file_name: "big.bin",
          mime: "application/octet-stream",
          size_bytes: 51 * 1024 * 1024,
        });
        expect(quotaError?.message ?? "").toContain("quota");

        await purgeNotes([note.id]);
        const second = await reconcile(createSupabaseAdapter(client, userId));
        // One tombstone for the note, one for its attachment.
        expect(second.deleted).toBe(2);

        const { data: gone } = await client.from("notes").select("id").eq("id", note.id).maybeSingle();
        expect(gone).toBeNull();

        // A second pass over an already-synced database must be a no-op for
        // notes and notebooks (the ping-pong guard).
        const third = await reconcile(createSupabaseAdapter(client, userId));
        expect(third.pulled).toBe(0);
      } finally {
        await admin.auth.admin.deleteUser(userId);
        await db().delete();
      }
    },
    60_000,
  );
});
