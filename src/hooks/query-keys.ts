/**
 * Query keys, centralised so invalidation cannot drift from the key a query
 * was registered under.
 */
export const QUERY_KEYS = {
  settings: ["settings"] as const,
  notebooks: ["notebooks"] as const,
  notes: (notebookId: string | null, includeTrashed: boolean) =>
    ["notes", notebookId, includeTrashed] as const,
  trash: ["notes", "trash"] as const,
  note: (id: string) => ["note", id] as const,
  versions: (id: string) => ["note", id, "versions"] as const,
  search: (query: string) => ["search", query] as const,
  storage: ["storage"] as const,
  backlinks: (id: string) => ["note", id, "backlinks"] as const,
  outgoingLinks: (id: string) => ["note", id, "outgoing-links"] as const,
  linkCounts: (ids: string) => ["links", "counts", ids] as const,
  attachments: ["attachments"] as const,
};
