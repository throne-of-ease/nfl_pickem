/**
 * Service Worker for Olympics Pick'em
 *
 * Provides:
 * - Offline support with cached responses
 * - Background sync for data updates
 * - Stale-while-revalidate strategy for API calls
 */

const CACHE_NAME = 'olympics-pickem-v1';
const STATIC_CACHE = 'olympics-static-v1';
const API_CACHE = 'olympics-api-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/data/teams.json',
  '/data/mock-games.json',
];

// API endpoints to cache with stale-while-revalidate
const API_ENDPOINTS = [
  '/api/tournament-data',
  '/api/games',
  '/api/leaderboard',
  '/api/standings',
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(err => {
        console.warn('[SW] Failed to cache some static assets:', err);
      });
    })
  );

  // Activate immediately
  self.skipWaiting();
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name !== CACHE_NAME &&
                   name !== STATIC_CACHE &&
                   name !== API_CACHE;
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );

  // Take control immediately
  self.clients.claim();
});

/**
 * Fetch event - handle requests
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests - stale-while-revalidate
  if (API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint))) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // Static data files - cache first
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML/JS/CSS - network first with cache fallback
  if (request.destination === 'document' ||
      request.destination === 'script' ||
      request.destination === 'style') {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else - network only
  event.respondWith(fetch(request));
});

/**
 * Stale-while-revalidate strategy
 * Returns cached response immediately, fetches update in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Fetch fresh data in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      // Clone and cache the response
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.warn('[SW] Network fetch failed:', error);
    return null;
  });

  // Return cached response immediately if available
  if (cachedResponse) {
    console.log('[SW] Returning cached response for:', request.url);
    return cachedResponse;
  }

  // Otherwise wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  // Both failed - return error
  return new Response(JSON.stringify({ error: 'Offline and no cached data' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Cache-first strategy
 * Returns cached response if available, otherwise fetches from network
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Network fetch failed for:', request.url);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network-first strategy
 * Tries network first, falls back to cache
 */
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // For navigation requests, return the cached index.html (SPA fallback)
    if (request.destination === 'document') {
      return cache.match('/index.html');
    }

    return new Response('Offline', { status: 503 });
  }
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
    event.ports[0].postMessage({ success: true });
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
