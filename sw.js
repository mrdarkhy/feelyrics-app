// Feelyrics — minimal offline cache for the static app
const C = "feelyrics-v4";
const ASSETS = ["./", "./index.html", "./styles.css", "./songs.js", "./app.js"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put("./index.html", cp)); return r; }).catch(() => caches.match("./index.html")));
  } else if (u.origin === location.origin && ASSETS.includes("." + u.pathname.slice(u.pathname.lastIndexOf("/")))) {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
  }
});
