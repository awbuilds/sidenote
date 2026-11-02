/**
 * App-shell service worker.
 *
 * The data is in IndexedDB, not here, so there is nothing to sync and no
 * network call to intercept for note reads. What this buys is launching the
 * app with no network at all, which matters because browser storage is
 * evictable and a user who opens the app offline must still reach their notes.
 *
 * Strategy:
 *  - navigations  : network first, falling back to the cached shell. A fresh
 *                   deploy should win, but offline must still work.
 *  - static assets: cache first, then network, then cache the response.
 *  - everything else: passthrough. Never cache an API or a mutation.
 */

const VERSION = "v1";
const SHELL_CACHE = `sidenote-shell-${VERSION}`;
const ASSET_CACHE = `sidenote-assets-${VERSION}`;

const PRECACHE = ["/notes", "/settings", "/trash", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("/notes");
          if (shell) return shell;
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
