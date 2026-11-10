// Service worker: permite instalar la app y abrirla sin conexión.
// Al cambiar archivos, sube el número de versión para forzar la actualización.
const VERSION = 'panel-cocina-v5';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './store.js',
  './config.js',
  './util.js',
  './reparto.js',
  './temporizadores.js',
  './agenda.js',
  './recetas.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero la red (para recibir siempre la última versión); si no hay conexión, la copia guardada.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
