import MiniSearch from "minisearch";
import {
  applyUpdate,
  createIndex,
  search,
  toHits,
  type SearchDoc,
  type SearchHit,
} from "./engine";

/**
 * Search worker.
 *
 * Indexing thousands of notes on the main thread would block typing, which is
 * exactly when the user is waiting on search. Everything here is off-thread;
 * the main thread only posts documents in and receives hits back.
 *
 * A full `index` message is for the first load, an import or a wipe. A normal
 * save sends `update` with only the notes that changed, and `persist` asks for
 * the serialised index when the main thread is ready to write it — the worker
 * no longer serialises on every keystroke.
 */

export type WorkerRequest =
  | { type: "index"; docs: SearchDoc[] }
  | { type: "restore"; serialized: string }
  | { type: "update"; docs: SearchDoc[]; remove: string[] }
  | { type: "persist" }
  | { type: "query"; id: number; query: string; limit?: number }
  | { type: "clear" };

export type WorkerResponse =
  | { type: "ready"; count: number; source: "index" | "restore" | "clear"; failed?: boolean }
  | { type: "updated"; count: number }
  | { type: "serialized"; serialized: string; count: number }
  | { type: "results"; id: number; hits: SearchHit[]; count: number };

let index = createIndex();

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

function serialise(): string {
  try {
    return JSON.stringify(index);
  } catch {
    return "";
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case "index": {
      index = createIndex();
      if (message.docs.length > 0) index.addAll(message.docs);
      post({ type: "ready", count: index.documentCount, source: "index" });
      return;
    }

    case "restore": {
      try {
        index = MiniSearch.loadJSON<SearchDoc>(message.serialized, {
          fields: ["title", "text"],
          storeFields: ["title", "text", "updatedAt"],
        });
      } catch {
        // A corrupt serialised index is not fatal: tell the main thread so it
        // can rebuild instead of silently serving an empty index.
        index = createIndex();
        post({ type: "ready", count: 0, source: "restore", failed: true });
        return;
      }
      post({ type: "ready", count: index.documentCount, source: "restore" });
      return;
    }

    case "update": {
      applyUpdate(index, message.docs, message.remove);
      post({ type: "updated", count: index.documentCount });
      return;
    }

    case "persist": {
      post({ type: "serialized", serialized: serialise(), count: index.documentCount });
      return;
    }

    case "query": {
      const hits = search(index, message.query, message.limit);
      post({ type: "results", id: message.id, hits, count: index.documentCount });
      return;
    }

    case "clear": {
      index = createIndex();
      post({ type: "ready", count: 0, source: "clear" });
      return;
    }
  }
};

export { toHits };
