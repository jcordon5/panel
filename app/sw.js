// Service worker for the web version. Every app file is fetched fresh (a
// cache-busting query gets past any CDN in front of the site, e.g. Cloudflare),
// so a release never mixes old and new files; the cached copy is only used
// offline. Vault data never goes through here.
const CACHE = "panel-app-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

function fresh(url) {
  const u = new URL(url);
  u.searchParams.set("_v", String(Math.floor(Date.now() / 60000))); // changes every minute
  return fetch(u.href, { cache: "no-store", credentials: "same-origin" });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  const target = req.mode === "navigate" ? new URL("./", location.href).href : url.origin + url.pathname;
  e.respondWith(
    fresh(target).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./")))
  );
});
