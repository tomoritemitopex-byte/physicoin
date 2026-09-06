// Custom service worker for PHYSI — offline support + install

const CACHE = "physi-v2";
const OFFLINE_URLS = [
  "/",
  "/app/roadmap",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
];

// Install — cache core shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE && caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Fetch — network first for API, cache first for assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  
  // API requests: network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const copier = response.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copier));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  
  // Non-API requests: cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then((cached) => cached).catch(() => fetch(e.request))
  );
});