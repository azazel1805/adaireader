// static/sw.js - Alternative install event
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app shell individually');
        const promises = urlsToCache.map((url) => {
          return fetch(url) // Fetch each resource
            .then((response) => {
              if (!response.ok) { // Check if fetch was successful
                throw new Error(`Failed to fetch ${url}, status: ${response.status}`);
              }
              return cache.put(url, response); // Put it in cache
            })
            .catch(err => {
              console.error(`[ServiceWorker] Failed to cache ${url}:`, err);
              // Optionally, you can decide if a failed cache here is critical
              // For core assets, it usually is.
            });
        });
        return Promise.all(promises); // Wait for all individual caches to complete
      })
      .then(() => self.skipWaiting())
  );
});
