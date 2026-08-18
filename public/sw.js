/*
 * Steinheim service worker — deliberately conservative.
 *
 * It exists for one reason: when the network is gone, the application shell
 * still opens and says so honestly. It never caches an API response, because
 * every one of them is authenticated and time-sensitive, and showing yesterday's
 * approval queue as if it were live would be worse than showing nothing.
 */

const VERSION = "steinheim-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icon.svg"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authenticated and live: never served from a cache, never stored.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn/")) return;

  // Navigation: try the network, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build output is content-hashed, so a cache hit is always the right bytes.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_build/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
