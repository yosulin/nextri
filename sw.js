const CACHE = 'nextri-v3.14';
// Rutas RELATIVAS al propio service worker, no absolutas. Con
// '/nextri/...' la app quedaba atada a esa ruta exacta: al renombrar el
// repositorio hubo que reescribirlas una por una, y habría vuelto a
// pasar con un dominio propio, un subdirectorio distinto o una copia de
// pruebas. Así funciona esté donde esté, sin tocar nada.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo-marca.svg?v=3.14',
  './favicon.ico',
  './icon.svg',
  './rivales/delta.png?v=3.14',
  './rivales/circuit.png?v=3.14',
  './rivales/vector.png?v=3.14',
  './rivales/chaos.png?v=3.14',
  './rivales/phantom.png?v=3.14',
  './rivales/lumina.png?v=3.14',
  './icon-192.png',
  './icon-512.png',
  './src/game/random.js?v=3.14',
  './src/game/geometry.js?v=3.14',
  './src/game/rules.js?v=3.14',
  './src/game/board.js?v=3.14',
  './src/game/board-quality.js?v=3.14',
  './src/game/engine.js?v=3.14',
  './src/game/state.js?v=3.14',
  './src/i18n/i18n.js?v=3.14',
  './src/i18n/locales/es.js?v=3.14',
  './src/i18n/locales/en.js?v=3.14',
  './src/i18n/locales/fr.js?v=3.14',
  './src/ui/radar.js?v=3.14',
  './src/ai/invitados.js?v=3.14',
  './src/ai/levels.js?v=3.14',
  './src/ai/ai.js?v=3.14',
  './src/stats/repository.js?v=3.14',
  './src/stats/aggregates.js?v=3.14',
  './src/stats/stats.js?v=3.14',
  './src/progression/guest-progress.js?v=3.14',
  './src/platform/storage.js?v=3.14'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Permite que la página en primer plano le diga a un worker recién
// instalado "actívate ya", en vez de esperar a que se cierren todas las
// pestañas. Es la otra mitad de la comprobación forzada en index.html.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Borrar SOLO las cachés antiguas de esta app, no todo el origen — Cache
  // Storage se comparte entre TODO lo que vive bajo yosulin.github.io
  // (el quiz, las rutas, los viajes...), no está aislado por proyecto.
  // Filtrar por "!== CACHE" borraría las cachés de esos otros proyectos.
  //
  // El prefijo antiguo se limpia también: tras el cambio de nombre esas
  // cachés quedarían huérfanas ocupando espacio para siempre.
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
