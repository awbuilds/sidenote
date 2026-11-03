/**
 * The one place the search `Worker` is constructed.
 *
 * Kept behind a function so tests can mock this module and drive the worker
 * protocol without a real worker (jsdom has none). `useSearch` must not build
 * a `Worker` itself, or every test of the hook needs a global stub.
 */
export function createSearchWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url));
}
