// Service worker for the web version: always revalidate with the network so a
// new release never mixes old and new files; cached copy only when offline.
// Vault data never goes through here.
const CACHE = "panel-app-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  const fresh = req.mode === "navigate" ? fetch(req, { cache: "no-cache" }) : fetch(url.href, { cache: "no-cache", credentials: "same-origin" });
  e.respondWith(
    fresh.then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./")))
  );
});
