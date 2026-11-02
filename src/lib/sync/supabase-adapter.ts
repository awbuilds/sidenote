import type { SupabaseClient } from "@supabase/supabase-js";
import { attachmentStoragePath } from "@/lib/attachments/path";
import type {
  RemoteAttachment,
  RemoteNote,
  RemoteNotebook,
  RemoteNoteTag,
  RemoteProfile,
  RemoteTag,
  SyncAdapter,
  SyncEntity,
} from "./types";

/**
 * The real adapter: PostgREST over HTTP, RLS-scoped to the signed-in user.
 *
 * Every read paginates (PostgREST caps a response at `PGRST_DB_MAX_ROWS`,
 * 1000 by default — truncation would look like data loss) and every write
 * chunks its payload so a first-run import of thousands of rows does not build
 * an unbounded request.
 */
const PAGE = 500;
const CHUNK = 100;

interface QueryResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

async function drain<T>(page: (from: number, to: number) => PromiseLike<QueryResult<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }
  return parts;
}

export function createSupabaseAdapter(client: SupabaseClient, userId: string): SyncAdapter {
  async function upsertRows<T extends object>(
    table: SyncEntity,
    rows: T[],
    stampColumn: "updated_at" | "created_at" = "updated_at",
  ): Promise<Map<string, number>> {
    const stamps = new Map<string, number>();
    for (const part of chunk(rows)) {
      const { data, error } = await client
        .from(table)
        .upsert(part.map((row) => ({ ...row, user_id: userId })), { onConflict: "id" })
        .select(`id, ${stampColumn}`);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as { id: string }[] & Record<string, string>[]) {
        stamps.set(row.id, Date.parse(row[stampColumn]));
      }
    }
    return stamps;
  }

  async function fetchByIds<T>(table: SyncEntity, ids: string[]): Promise<T[]> {
    const out: T[] = [];
    for (const part of chunk(ids, 200)) {
      out.push(
        ...(await drain<T>((from, to) =>
          client.from(table).select("*").in("id", part).order("id").range(from, to),
        )),
      );
    }
    return out;
  }

  return {
    async listManifest(table) {
      if (table === "tags") {
        // Tags are push-dominant and have no updated_at; created_at only needs
        // to answer "does the remote already know this id?".
        const rows = await drain<{ id: string; created_at: string }>((from, to) =>
          client
            .from("tags")
            .select("id, created_at")
            .eq("user_id", userId)
            .order("id")
            .range(from, to),
        );
        return rows.map((row) => ({ id: row.id, updatedAt: Date.parse(row.created_at) }));
      }

      const rows = await drain<{ id: string; updated_at: string }>((from, to) =>
        client
          .from(table)
          .select("id, updated_at")
          .eq("user_id", userId)
          .order("id")
          .range(from, to),
      );
      return rows.map((row) => ({ id: row.id, updatedAt: Date.parse(row.updated_at) }));
    },

    fetchNotebooks: (ids) => fetchByIds<RemoteNotebook>("notebooks", ids),
    fetchTags: (ids) => fetchByIds<RemoteTag>("tags", ids),
    fetchNotes: (ids) => fetchByIds<RemoteNote>("notes", ids),

    upsertNotebooks: (rows) => upsertRows("notebooks", rows),
    upsertTags: (rows) => upsertRows("tags", rows, "created_at"),
    upsertNotes: (rows) => upsertRows("notes", rows),

    async deleteRows(table, ids) {
      for (const part of chunk(ids, 50)) {
        const { error } = await client.from(table).delete().in("id", part);
        if (error) throw new Error(error.message);
      }
    },

    async listNoteTags() {
      return drain<RemoteNoteTag>((from, to) =>
        client
          .from("note_tags")
          .select("note_id, tag_id")
          .eq("user_id", userId)
          .order("note_id")
          .order("tag_id")
          .range(from, to),
      );
    },

    async upsertNoteTags(pairs) {
      for (const part of chunk(pairs, 200)) {
        const { error } = await client
          .from("note_tags")
          .upsert(
            part.map((pair) => ({ ...pair, user_id: userId })),
            { onConflict: "note_id,tag_id" },
          );
        if (error) throw new Error(error.message);
      }
    },

    async deleteNoteTags(pairs) {
      for (const pair of pairs) {
        const { error } = await client
          .from("note_tags")
          .delete()
          .eq("note_id", pair.note_id)
          .eq("tag_id", pair.tag_id);
        if (error) throw new Error(error.message);
      }
    },

    async getProfile() {
      const { data, error } = await client
        .from("profiles")
        .select("display_name, updated_at")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as { display_name: string | null; updated_at: string };
      return {
        displayName: row.display_name ?? "",
        updatedAt: Date.parse(row.updated_at),
      } satisfies RemoteProfile;
    },

    async upsertProfile(displayName) {
      const { error } = await client
        .from("profiles")
        .upsert({ id: userId, display_name: displayName }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    },

    async listAttachments() {
      return drain<RemoteAttachment>((from, to) =>
        client
          .from("attachments")
          .select(
            "id, note_id, path, file_name, mime, size_bytes, width, height, created_at, deleted_at",
          )
          .eq("user_id", userId)
          .order("created_at")
          .order("id")
          .range(from, to),
      );
    },

    async uploadAttachment(row, bytes) {
      const path = attachmentStoragePath(userId, row.id, row.file_name);
      const { error: uploadError } = await client.storage
        .from("attachments")
        .upload(path, bytes, { contentType: row.mime, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { error } = await client
        .from("attachments")
        .upsert({ ...row, path, user_id: userId }, { onConflict: "id" });
      if (error) throw new Error(error.message);
    },

    async downloadAttachment(path) {
      const { data, error } = await client.storage
        .from("attachments")
        .createSignedUrl(path, 120);
      if (error) throw new Error(error.message);

      const response = await fetch(data.signedUrl);
      if (!response.ok) {
        throw new Error(`Could not download an attachment (${response.status})`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async softDeleteAttachment(id, fileName) {
      const path = attachmentStoragePath(userId, id, fileName);
      const { error: storageError } = await client.storage.from("attachments").remove([path]);
      if (storageError && !/not.?found/i.test(storageError.message)) {
        throw new Error(storageError.message);
      }

      const { error } = await client
        .from("attachments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
