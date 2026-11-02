import type { JSONContent } from "@tiptap/core";
import { getSupabase } from "@/lib/supabase/client";

/** A share row as the app uses it — the password hash never crosses this line. */
export interface ShareRecord {
  id: string;
  token: string;
  hasPassword: boolean;
  expiresAt: number | null;
  createdAt: number;
}

export interface SharedNote {
  title: string;
  contentJson: JSONContent;
  contentMarkdown: string;
  updatedAt: number;
}

export function shareUrl(token: string): string {
  const path = `/s/${token}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

function friendly(message: string): string {
  if (message.toLowerCase().includes("sign in")) return "Sign in to create share links.";
  if (message.toLowerCase().includes("foreign key")) {
    return "This note has not synced yet — give it a moment and try again.";
  }
  return message;
}

export async function createShare(
  noteId: string,
  options: { password?: string; expiresAt?: number | null } = {},
): Promise<{ share?: ShareRecord; error?: string }> {
  const client = getSupabase();
  if (!client) return { error: "Sign in to create share links." };

  const password = options.password?.trim() ?? "";
  const { data, error } = await client.rpc("create_share", {
    p_note_id: noteId,
    p_password: password === "" ? null : password,
    p_expires_at: options.expiresAt ? new Date(options.expiresAt).toISOString() : null,
  });
  if (error) return { error: friendly(error.message) };

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = rows[0] as
    | { id: string; token: string; has_password: boolean; expires_at: string | null }
    | undefined;
  if (!row) return { error: "Could not create the link." };

  return {
    share: {
      id: row.id,
      token: row.token,
      hasPassword: row.has_password,
      expiresAt: row.expires_at === null ? null : Date.parse(row.expires_at),
      createdAt: Date.now(),
    },
  };
}

export async function listShares(noteId: string): Promise<ShareRecord[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from("shares")
    .select("id, token, password_hash, expires_at, revoked_at, created_at")
    .eq("note_id", noteId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map(
    (row: {
      id: string;
      token: string;
      password_hash: string | null;
      expires_at: string | null;
      created_at: string;
    }) => ({
      id: row.id,
      token: row.token,
      hasPassword: row.password_hash !== null,
      expiresAt: row.expires_at === null ? null : Date.parse(row.expires_at),
      createdAt: Date.parse(row.created_at),
    }),
  );
}

export async function revokeShare(id: string): Promise<{ error?: string }> {
  const client = getSupabase();
  if (!client) return { error: "Sign in to manage share links." };

  const { error } = await client
    .from("shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

export interface ShareWithNote extends ShareRecord {
  noteTitle: string;
}

/** Every active link this user owns, across notes — the settings view. */
export async function listAllShares(): Promise<ShareWithNote[]> {
  const client = getSupabase();
  if (!client) return [];

  const { data, error } = await client
    .from("shares")
    .select("id, token, password_hash, expires_at, created_at, notes(title)")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map(
    (row: {
      id: string;
      token: string;
      password_hash: string | null;
      expires_at: string | null;
      created_at: string;
      notes: { title: string } | { title: string }[] | null;
    }) => {
      const embedded = Array.isArray(row.notes) ? row.notes[0] : row.notes;
      return {
        id: row.id,
        token: row.token,
        hasPassword: row.password_hash !== null,
        expiresAt: row.expires_at === null ? null : Date.parse(row.expires_at),
        createdAt: Date.parse(row.created_at),
        noteTitle: embedded?.title ?? "",
      };
    },
  );
}

export interface SharedNoteLookup {
  note?: SharedNote;
  needsPassword?: boolean;
  notFound?: boolean;
}

export async function fetchSharedNote(
  token: string,
  password?: string | null,
): Promise<SharedNoteLookup> {
  const client = getSupabase();
  if (!client) return { notFound: true };

  const { data, error } = await client.rpc("get_shared_note", {
    p_token: token,
    p_password: password ?? null,
  });
  if (error) return { notFound: true };

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const row = rows[0] as
    | { title: string; content_json: JSONContent; content_markdown: string; updated_at: string }
    | undefined;
  if (row) {
    return {
      note: {
        title: row.title,
        contentJson: row.content_json,
        contentMarkdown: row.content_markdown,
        updatedAt: Date.parse(row.updated_at),
      },
    };
  }

  // Empty result: either the link needs a password or it is gone. Ask.
  const info = await client.rpc("share_info", { p_token: token });
  const infoRows = Array.isArray(info.data) ? info.data : info.data ? [info.data] : [];
  const meta = infoRows[0] as { found: boolean; requires_password: boolean } | undefined;
  if (!meta?.found) return { notFound: true };
  return { needsPassword: true };
}
