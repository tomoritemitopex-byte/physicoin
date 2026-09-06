---
// Custom service worker for PHYSI — offline support + install
// This gives the same "app" feeling as an APK without the Play Store friction

const CACHE = "physi-v1";
const OFFLINE_URLS = ["/", "/app/roadmap", "/app/timetable", "/manifest.json"];

// Install — cache core shell
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS))
  );
});

// Fetch — serve from cache, fall back to network
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
