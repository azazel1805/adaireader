// static/sw.js
const CACHE_NAME = 'gutenberg-reader-cache-v1'; // Change version when you update assets
const urlsToCache = [
  '/', // Your start_url
  '/static/css/style.css',
  '/static/js/script.js',
  '/static/manifest.json',
  // Add paths to your icons
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  // Add paths to your fonts if self-hosted, or rely on CDN caching
  // 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap',
  // 'https://fonts.gstatic.com/s/lato/v23/S6uyw4BMUTPHjx4wXg.woff2', // Example font file
  // 'https://fonts.gstatic.com/s/merriweather/v28/u-440qyriQwlOrhSvowK_l5-fCZM.woff2' // Example font file
];

// Install event:
// This event is triggered when the service worker is first installed.
// We open a cache and add all the core assets to it.
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activate worker immediately
  );
});

// Activate event:
// This event is triggered when the service worker is activated.
// We clean up old caches here.
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Take control of open clients
  );
});

// Fetch event:
// This event is triggered for every network request made by the page.
// We implement a cache-first strategy: try to serve from cache,
// if not found, fetch from network, then cache the new response.
self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests for http/https schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    // console.log('[ServiceWorker] Fetch event for non-GET or non-http request, skipping cache:', event.request.url);
    event.respondWith(fetch(event.request));
    return;
  }

  // Don't cache API calls for book content or definitions
  if (event.request.url.includes('/fetch_book/') || event.request.url.includes('/get_definition')) {
    // console.log('[ServiceWorker] Fetch event for API call, network first:', event.request.url);
    event.respondWith(fetch(event.request));
    return;
  }
  
  // console.log('[ServiceWorker] Fetch event for', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          // console.log('[ServiceWorker] Found in cache:', event.request.url);
          return response; // Serve from cache
        }
        // console.log('[ServiceWorker] Not in cache, fetching from network:', event.request.url);
        return fetch(event.request).then((networkResponse) => {
          // Check if we received a valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
            return networkResponse;
          }

          // IMPORTANT: Clone the response. A response is a stream
          // and because we want the browser to consume the response
          // as well as the cache consuming the response, we need
          // to clone it so we have two streams.
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              // console.log('[ServiceWorker] Caching new resource:', event.request.url);
              cache.put(event.request, responseToCache);
            });
          return networkResponse;
        }).catch(error => {
          console.error('[ServiceWorker] Fetch failed; returning offline page instead.', error);
          // Optionally, return a generic offline fallback page if desired
          // return caches.match('/offline.html'); 
        });
      })
  );
});