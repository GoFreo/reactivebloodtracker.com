const CACHE_NAME = "rht-shell-v2";
const SHELL_FILES = ["/", "/index.html", "/manifest.json", "/icon.svg", "/icon-180.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Network-first: this app's data lives in IndexedDB, not the cache, so we only
// need the shell to load offline — always prefer a fresh copy when online.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Large video: let the browser stream it (range requests can't go in the cache).
  if (new URL(event.request.url).pathname.endsWith(".mp4")) return;
  // Never cache the Dexcom return page: its URL carries a one-time sign-in code.
  if (new URL(event.request.url).pathname === "/dexcom-callback") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
