const CACHE = "next-rep-final-v5";
const ASSETS = ["./", "index.html", "styles.css?v=7", "addons.css?v=2", "app.js?v=7", "addons.js?v=2", "companion.js?v=2", "ai.js?v=1", "sync.js?v=1", "knowledge-data.js?v=1", "manifest.webmanifest", "icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
