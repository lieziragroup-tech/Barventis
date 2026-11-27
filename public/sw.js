// Barventis Offline Service Worker
// Caches application shell and assets so the app opens and functions offline.

const CACHE_NAME = 'barventis-app-shell-v2';
const PRECACHE_ASSETS = [
  '/src/barventis-icon-favicon.png'
];

// Install: precache essential non-HTML shell assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-critical warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up outdated caches (including v1 poisoned HTML-as-JS caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('barventis-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for navigation, MIME-Safe Stale-While-Revalidate for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests or external API mutations
  if (request.method !== 'GET') return;

  // Skip chrome-extension, dev server websockets, or third-party tracking
  if (!url.protocol.startsWith('http')) return;

  // SPA Navigation requests (HTML): Always Network-First so new deployments get fresh chunk hashes
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone));
          }
          return response;
        })
        .catch(async () => {
          const fallback = await caches.match('/index.html');
          return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Static assets (scripts, styles, images, fonts): MIME-Verified Stale-While-Revalidate
  const isScriptOrStyle = /\.(js|mjs|css)$/i.test(url.pathname);
  const isStaticAsset = (
    isScriptOrStyle ||
    /\.(png|jpg|jpeg|svg|ico|woff|woff2|ttf|webp)$/i.test(url.pathname) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Guard against previously poisoned cache where text/html was cached for a .js/.css URL
        if (cachedResponse && isScriptOrStyle) {
          const cachedType = (cachedResponse.headers.get('content-type') || '').toLowerCase();
          if (cachedType.includes('text/html')) {
            caches.open(CACHE_NAME).then((cache) => cache.delete(request));
            cachedResponse = null;
          }
        }

        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            const contentType = (networkResponse.headers.get('content-type') || '').toLowerCase();
            // Never cache HTML fallback responses as JS/CSS static chunks
            if (isScriptOrStyle && contentType.includes('text/html')) {
              caches.open(CACHE_NAME).then((cache) => cache.delete(request));
              return new Response('Chunk missing or outdated after deployment', {
                status: 404,
                statusText: 'Chunk Not Found'
              });
            }
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            return networkResponse;
          })
          .catch((err) => {
            if (cachedResponse) return cachedResponse;
            throw err;
          });

        return cachedResponse || fetchPromise;
      })
    );
  }
});
