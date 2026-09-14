const CACHE_NAME = "autokeep-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((response) => response ?? caches.match("/"))));
});

self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? { title: "AutoKeep", body: "Há uma atualização na sua garagem." };
  event.waitUntil(self.registration.showNotification(String(payload.title).slice(0, 80), {
    body: String(payload.body).slice(0, 240),
    icon: "/icon.svg",
  }));
});
