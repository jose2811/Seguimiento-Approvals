// Service worker de Approvals.
//
// Estrategia: RED PRIMERO, caché como respaldo — nunca al revés.
// - Si hay internet en el momento de abrir la app, siempre se va a buscar la
//   versión más reciente al servidor (y de paso se actualiza lo guardado).
// - Solo si la red falla (sin datos / sin wifi en ese instante) se usa la
//   última copia guardada, para que al menos abra algo en vez de pantalla
//   negra o el error de "sin conexión" de Chrome.
// Esto evita el problema clásico de las apps con caché: quedarse pegado en
// una versión vieja aunque ya haya una nueva — aquí eso solo pasa mientras
// de verdad no hay señal, y se autocorrige solo en el siguiente open con red.
//
// IMPORTANTE: subir CACHE_VERSION cada vez que se publique un cambio grande,
// para que los cachés viejos se limpien solos en el siguiente open.
const CACHE_VERSION='v51';
const CACHE_NAME = `seguimiento-aceptados-${CACHE_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png?v=4',
  './icons/icon-512.png?v=4',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// Red "colgada" (hay señal pero no responde): a los 8 s (página) o 4 s (lo demás) usamos la última copia guardada.

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo manejamos GET dentro del mismo origen — todo lo demás (Supabase, etc.)
  // pasa de largo tal cual, directo a la red, sin tocarlo.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const esPagina = req.mode === 'navigate' || req.destination === 'document';
  // La página siempre se pide sin caché del navegador, para no quedarse con una versión vieja
  const red = fetch(esPagina ? new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }) : req)
    .then((r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {}); } return r; });
  // Aunque se use la copia guardada por red lenta, la descarga sigue y deja lista la versión nueva para la próxima vez
  event.waitUntil(red.catch(() => {}));
  event.respondWith(
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject('timeout'), esPagina ? 8000 : 4000);
      red.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
    }).catch(() => caches.match(req).then((cached) => cached || red))
  );
});
