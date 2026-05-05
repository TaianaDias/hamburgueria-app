const CACHE_NAME = "hamburgueria-app-v19";
const APP_SHELL = [
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
  "/style.css",
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
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
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
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
