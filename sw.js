const CACHE = 'nextri-v2.64';
const ASSETS = [
  '/nextri/',
  '/nextri/index.html',
  '/nextri/manifest.json',
  '/nextri/icon.svg',
  '/nextri/icon-192.png',
  '/nextri/icon-512.png',
  '/nextri/src/game/random.js?v=2.64',
  '/nextri/src/game/geometry.js?v=2.64',
  '/nextri/src/game/rules.js?v=2.64',
  '/nextri/src/game/board.js?v=2.64',
  '/nextri/src/game/engine.js?v=2.64',
  '/nextri/src/game/state.js?v=2.64',
  '/nextri/src/ai/levels.js?v=2.64',
  '/nextri/src/ai/ai.js?v=2.64',
  '/nextri/src/platform/storage.js?v=2.64'
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
  // Prefijo propio para no borrar las cachés de los demás proyectos que
  // viven bajo yosulin.github.io. Se limpia también el prefijo antiguo:
  // tras el cambio de nombre, las cachés viejas quedarían huérfanas
  // ocupando espacio para siempre.
  const CACHE_PREFIX = 'nextri-';
  const PREFIJO_ANTIGUO = 'juego-circulos-';
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(
      keys.filter(k => (k.startsWith(CACHE_PREFIX) || k.startsWith(PREFIJO_ANTIGUO)) && k !== CACHE).map(k => caches.delete(k))
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
