/**
 * Query keys, centralised so invalidation cannot drift from the key a query
 * was registered under.
 *
 * The app runs with `staleTime: Infinity`, so a family that is missing from an
 * invalidation is not merely late — it is stale until the page reloads. That
 * is why the `tags` family is listed here: tag chips, sidebar counts and the
 * tag manager all live under it, and leaving it out made every tag edit
 * invisible until a refresh.
 */
export const QUERY_KEYS = {
  settings: ["settings"] as const,
  notebooks: ["notebooks"] as const,
  notes: (notebookId: string | null, includeTrashed: boolean) =>
    ["notes", notebookId, includeTrashed] as const,
  noteTitles: ["notes", "titles"] as const,
  recentNotes: (limit: number) => ["notes", "recent", limit] as const,
  trashCount: ["notes", "trash-count"] as const,
  trash: ["notes", "trash"] as const,
  note: (id: string) => ["note", id] as const,
  noteTags: (id: string) => ["note", id, "tags"] as const,
  versions: (id: string) => ["note", id, "versions"] as const,
  backlinks: (id: string) => ["note", id, "backlinks"] as const,
  outgoingLinks: (id: string) => ["note", id, "outgoing-links"] as const,
  tags: ["tags"] as const,
  tagSummaries: ["tags", "summaries"] as const,
  tagsForNotes: (key: string) => ["tags", "for-notes", key] as const,
  taggedNotes: (tagId: string) => ["tags", tagId, "notes"] as const,
  linkCounts: (ids: string) => ["links", "counts", ids] as const,
  attachments: ["attachments"] as const,
  attachmentUsage: (userId: string | null) => ["attachment-usage", userId] as const,
  shares: (noteId: string | null) => ["shares", noteId] as const,
  allShares: ["shares", "all"] as const,
  samplePreview: ["sample-preview"] as const,
};

/**
 * Prefixes for `invalidateQueries`. A mutation names the families it touched;
 * anything outside that set keeps its cached value.
 */
export const QUERY_FAMILIES = {
  settings: ["settings"],
  notebooks: ["notebooks"],
  notes: ["notes"],
  note: ["note"],
  tags: ["tags"],
  links: ["links"],
  attachments: ["attachments"],
  shares: ["shares"],
  samplePreview: ["sample-preview"],
} as const;
