const CACHE_NAME = "physi-shell-v1";
const SHELL_URLS = ["/", "/app/roadmap", "/app/timetable", "/app/profile", "/manifest.json", "/ref1.webp", "/ref2.webp"];
const OFFLINE_QUEUE_DB = "physi-offline-queue";
const OFFLINE_STORE = "posts";

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) db.createObjectStore(OFFLINE_STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function queuePost(url, body, headers) {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    tx.objectStore(OFFLINE_STORE).add({ url, body, headers, ts: Date.now() });
  } catch {}
}
async function flushQueue() {
  try {
    const db = await openQueueDB();
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    const store = tx.objectStore(OFFLINE_STORE);
    const getAll = store.getAll();
    const keysReq = store.getAllKeys();
    const data = await new Promise((res, rej) => {
      getAll.onsuccess = () => res(getAll.result || []);
      getAll.onerror = () => rej(getAll.error);
    });
    const keys = await new Promise((res, rej) => {
      keysReq.onsuccess = () => res(keysReq.result || []);
      keysReq.onerror = () => rej(keysReq.error);
    });
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const key = keys[i];
      try {
        const r = await fetch(item.url, { method: "POST", headers: item.headers || { "content-type": "application/json" }, body: item.body });
        if (r.ok) {
          const delTx = db.transaction(OFFLINE_STORE, "readwrite");
          delTx.objectStore(OFFLINE_STORE).delete(key);
          await new Promise((res) => { delTx.oncomplete = res; delTx.onerror = res; });
        }
      } catch {}
    }
  } catch {}
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS.map((u) => new Request(u, { cache: "reload" }))).catch(()=>{}))
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(()=> self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // queue offline POSTs to retry
  if (req.method === "POST") {
    event.respondWith(
      fetch(req.clone()).catch(async () => {
        try {
          const body = await req.clone().text();
          const headers = {};
          req.headers.forEach((v, k) => (headers[k] = v));
          await queuePost(url.pathname + url.search, body, headers);
          // notify clients
          self.clients.matchAll().then((clients) => clients.forEach((c) => c.postMessage({ type: "OFFLINE_QUEUED", url: url.pathname })));
        } catch {}
        return new Response(JSON.stringify({ ok: false, queued: true, offline: true }), { status: 202, headers: { "content-type": "application/json" } });
      })
    );
    return;
  }
  // shell cache-first for navigations and manifest/images
  if (req.method === "GET") {
    const isShell = SHELL_URLS.some((s) => url.pathname === s || url.pathname.startsWith("/app/")) || url.pathname === "/" || url.pathname === "/manifest.json";
    if (isShell) {
      event.respondWith(
        caches.match(req).then((cached) => {
          const fetched = fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res.clone())).catch(()=>{});
            return res;
          }).catch(()=> cached || new Response("offline", { status: 503 }));
          return cached || fetched;
        })
      );
      return;
    }
    // network-first for api
    if (url.pathname.startsWith("/api/")) {
      event.respondWith(fetch(req).catch(() => caches.match(req).then((c)=> c || new Response(JSON.stringify({ ok:false, offline:true }), { headers:{ "content-type":"application/json"}}))));
      return;
    }
  }
});
self.addEventListener("sync", (event) => {
  if (event.tag === "physi-flush" || event.tag === "flush-queue") {
    event.waitUntil(flushQueue());
  }
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FLUSH_QUEUE") event.waitUntil(flushQueue());
});
self.addEventListener("online", () => { flushQueue(); });
self.addEventListener("periodicsync", (event) => { event.waitUntil(flushQueue()); });
// also flush on connect
self.addEventListener("fetch", () => {}); // keep alive
setInterval(() => { flushQueue(); }, 30000);
