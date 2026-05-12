const CACHE_NAME = "hamburgueria-app-v22";
const APP_SHELL = [...new Set([
  "/",
  "/login.html",
  "/index.html",
  "/estoque.html",
  "/desperdicio.html",
  "/reposicao-producao.html",
  "/compras.html",
  "/alertas-reposicao.html",
  "/analise-compras.html",
  "/dashboard-compras.html",
  "/fornecedores.html",
  "/dashboard-saas.html",
  "/producao.html",
  "/relatorio.html",
  "/etiquetas.html",
  "/funcionarias.html",
  "/configuracoes.html",
  "/funcionarios.html",
  "/assets/app-core.min.css",
  "/assets/app-dashboard.min.css",
  "/assets/app-login.min.css",
  "/firebase.js",
  "/app.js",
  "/barcode-cache.js",
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

function isValidCacheResponse(response) {
  return response && response.ok && response.type === "basic";
}

function getCacheKey(request) {
  const url = new URL(request.url);

  if (
    request.mode === "navigate"
    || request.destination === "document"
    || url.pathname === "/"
    || url.pathname.endsWith(".html")
  ) {
    return url.pathname || "/";
  }

  return request;
}

async function matchCached(request) {
  const url = new URL(request.url);
  const byKey = await caches.match(getCacheKey(request));

  if (byKey) {
    return byKey;
  }

  if (request.mode === "navigate" || request.destination === "document" || url.pathname.endsWith(".html")) {
    return caches.match(url.pathname || "/");
  }

  return caches.match(request);
}

async function warmAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(APP_SHELL.map(async (path) => {
    const response = await fetch(new Request(path, { cache: "reload" }));

    if (isValidCacheResponse(response)) {
      await cache.put(path, response.clone());
    }
  }));
}

async function fetchAndCache(request) {
  const response = await fetch(request);

  if (isCacheableRequest(request) && isValidCacheResponse(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(getCacheKey(request), response.clone());
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

self.addEventListener("fetch", (event) => {
  if (!isCacheableRequest(event.request)) {
    return;
  }

  event.respondWith(
    matchCached(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetchAndCache(event.request).catch(() => matchCached(event.request));
    })
  );
});
