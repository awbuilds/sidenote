import MiniSearch from "minisearch";
import {
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
 * `restore` loads a serialized index so a page load does not have to rebuild
 * it. If the stored dataVersion does not match, the main thread sends a full
 * `index` instead.
 */

export type WorkerRequest =
  | { type: "index"; docs: SearchDoc[] }
  | { type: "restore"; serialized: string }
  | { type: "query"; id: number; query: string; limit?: number }
  | { type: "clear" };

export type WorkerResponse =
  | { type: "ready"; count: number; serialized: string }
  | { type: "results"; id: number; hits: SearchHit[]; count: number };

let index = createIndex();

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

/** Announce readiness along with a serialised copy the main thread persists. */
function announceReady(): void {
  let serialized = "";
  try {
    serialized = JSON.stringify(index);
  } catch {
    serialized = "";
  }
  post({ type: "ready", count: index.documentCount, serialized });
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case "index": {
      index = createIndex();
      if (message.docs.length > 0) index.addAll(message.docs);
      announceReady();
      return;
    }

    case "restore": {
      try {
        index = MiniSearch.loadJSON<SearchDoc>(
          message.serialized,
          { fields: ["title", "text"], storeFields: ["title", "text", "updatedAt"] },
        );
      } catch {
        // A corrupt serialised index is not fatal. The main thread sees the
        // mismatched dataVersion and sends a full rebuild instead.
        index = createIndex();
      }
      announceReady();
      return;
    }

    case "query": {
      const hits = search(index, message.query, message.limit);
      post({ type: "results", id: message.id, hits, count: index.documentCount });
      return;
    }

    case "clear": {
      index = createIndex();
      announceReady();
      return;
    }
  }
};

export { toHits };
