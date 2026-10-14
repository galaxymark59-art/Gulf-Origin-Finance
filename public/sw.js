const CACHE = "mcube-shell-v3";
self.addEventListener("install", (e) =>
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/");
      const html = await response.clone().text();
      await cache.put("/", response);
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
      ].map((m) => m[1]);
      await cache.addAll([...assets, "/logo.svg", "/fonts/Amiri-Regular.ttf"]);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (
          key !== CACHE &&
          (key.startsWith("gulf-origin-shell-") ||
            key.startsWith("mcube-shell-"))
        )
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== self.location.origin
  )
    return;
  const navigation = e.request.mode === "navigate";
  // Only content-hashed build assets are immutable. Logos and other stable URLs
  // must refresh online, otherwise an old brand can survive every page refresh.
  const immutable = new URL(e.request.url).pathname.startsWith("/assets/");
  const fresh = () =>
    fetch(e.request).then(async (r) => {
      if (r.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(navigation ? "/" : e.request, r.clone());
      }
      return r;
    });
  if (navigation || !immutable) {
    e.respondWith(
      fresh().catch(() => caches.match(navigation ? "/" : e.request)),
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((c) => c || fresh()));
});
