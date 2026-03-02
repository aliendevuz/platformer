const CACHE_NAME = "bounce-v2.0";

const urlsToCache = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/assets/image/big-ball.svg",
  "/assets/image/brick.svg",
  "/assets/tilemaps/level1.lvl",
  "/assets/tilemaps/level2.lvl",
  "/assets/tilemaps/level3.lvl",
  "/assets/tilemaps/level4.lvl",
  "/assets/tilemaps/level5.lvl",
  "/assets/tilemaps/level6.lvl",
  "/assets/tilemaps/level7.lvl",
  "/assets/tilemaps/level8.lvl",
  "/assets/tilemaps/level9.lvl",
  "/assets/tilemaps/level10.lvl",
  "/assets/tilemaps/level11.lvl",
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
