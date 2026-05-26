const CACHE = 'brickvault-v5';
const PRECACHE = ['/', '/app.js', '/app.css', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// API routes we'll cache for offline reading (GET only, network-first with fallback)
const API_CACHE_ROUTES = ['/api/collection', '/api/themes', '/api/collection/stats', '/api/collection/history', '/api/sets/'];
const SET_DETAIL_TTL_MS = 24 * 60 * 60 * 1000; // 24hr TTL for set detail

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
    const isSetDetail = url.pathname.startsWith('/api/sets/') && url.pathname !== '/api/sets/search';
    const shouldCache = isSetDetail || API_CACHE_ROUTES.some(r => url.pathname === r || url.pathname.startsWith(r + '?') || (r.endsWith('/') && url.pathname.startsWith(r)));
    if (!shouldCache) return; // let other API calls go through unmodified

    e.respondWith(
      caches.open(CACHE).then(async cache => {
        // For set detail: try cache first if fresh (24hr TTL)
        if (isSetDetail) {
          const cached = await cache.match(e.request);
          if (cached) {
            const cachedDate = new Date(cached.headers.get('sw-cached-at') || 0);
            if (Date.now() - cachedDate.getTime() < SET_DETAIL_TTL_MS) return cached;
          }
        }
        try {
          const fresh = await fetch(e.request);
          if (fresh.ok) {
            const resp = fresh.clone();
            if (isSetDetail) {
              // Store with cache timestamp header
              const headers = new Headers(resp.headers);
              headers.set('sw-cached-at', new Date().toISOString());
              const body = await resp.arrayBuffer();
              cache.put(e.request, new Response(body, { status: resp.status, headers }));
            } else {
              cache.put(e.request, resp);
            }
          }
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
