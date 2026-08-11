const CACHE = 'juego-circulos-v2.53';
const ASSETS = [
  '/juego-circulos/',
  '/juego-circulos/index.html',
  '/juego-circulos/manifest.json',
  '/juego-circulos/icon-192.png',
  '/juego-circulos/icon-512.png',
  '/juego-circulos/src/game/random.js?v=2.53',
  '/juego-circulos/src/game/geometry.js?v=2.53',
  '/juego-circulos/src/game/rules.js?v=2.53',
  '/juego-circulos/src/game/board.js?v=2.53',
  '/juego-circulos/src/game/engine.js?v=2.53',
  '/juego-circulos/src/game/state.js?v=2.53',
  '/juego-circulos/src/ai/levels.js?v=2.53',
  '/juego-circulos/src/ai/ai.js?v=2.53',
  '/juego-circulos/src/platform/storage.js?v=2.53'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Borrar SOLO las cachés antiguas de esta app, no todo el origen — Cache
  // Storage se comparte entre TODO lo que vive bajo yosulin.github.io
  // (el quiz, las rutas, los viajes...), no está aislado por proyecto.
  // Filtrar por "!== CACHE" en vez de por prefijo propio borraría las
  // cachés de esos otros proyectos si el navegador los ha visitado.
  const CACHE_PREFIX = 'juego-circulos-';
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))
    )
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTML) {
    // Network-first para HTML: siempre intenta la red, cae en caché solo si falla
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first para iconos, manifest, etc.
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
