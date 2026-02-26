const CACHE_NAME = "v1.0";

const urlsToCache = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/assets/image/big-ball-svg",
  "/assets/image/brick.svg",
  "/assets/tilemaps/level1.lvl",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
