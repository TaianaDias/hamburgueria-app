const CACHE_NAME = "hamburgueria-app-v23";
const STATIC_ASSETS = [...new Set([
  "/assets/app-core.min.css",
  "/assets/app-dashboard.min.css",
  "/assets/app-login.min.css",
  "/firebase.js",
  "/app.js",
  "/barcode-cache.js",
  "/premium-shell.js",
  "/operational-core.js",
  "/runtime-config.json",
  "/manifest.json",
  "/icon.svg",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png"
])];

function isCacheableRequest(request) {
  const url = new URL(request.url);
  return request.method === "GET" && url.origin === self.location.origin && /^https?:$/.test(url.protocol);
}

function isStaticAssetRequest(request) {
  const url = new URL(request.url);

  return (
    isCacheableRequest(request)
    && request.mode !== "navigate"
    && request.destination !== "document"
    && !url.pathname.endsWith(".html")
    && !url.pathname.startsWith("/api/")
  );
}

function isValidCacheResponse(response) {
  return response && response.ok && response.type === "basic";
}

async function warmAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(STATIC_ASSETS.map(async (path) => {
    const response = await fetch(new Request(path, { cache: "reload" }));

    if (isValidCacheResponse(response)) {
      await cache.put(path, response.clone());
    }
  }));
}

async function fetchAndCache(request) {
  const response = await fetch(request);

  if (isStaticAssetRequest(request) && isValidCacheResponse(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (!isStaticAssetRequest(event.request)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetchAndCache(event.request))
  );
});
