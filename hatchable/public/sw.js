const CACHE = 'brickvault-v2';
const PRECACHE = ['/', '/app.js', '/app.css', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// API routes we'll cache for offline reading (GET only, stale-while-revalidate)
const API_CACHE_ROUTES = ['/api/collection', '/api/themes'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // API routes: network-first with cached fallback for whitelisted endpoints
  if (url.pathname.startsWith('/api/')) {
    const shouldCache = API_CACHE_ROUTES.some(r => url.pathname === r || url.pathname.startsWith(r + '?'));
    if (!shouldCache) return; // let other API calls go through unmodified

    e.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const fresh = await fetch(e.request);
          if (fresh.ok) cache.put(e.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(e.request);
          return cached || new Response(
            JSON.stringify({ error: 'offline', items: [], count: 0 }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
