// Service Worker for COE Portal - Fixed Version
const CACHE_NAME = 'coe-portal-v3';
const urlsToCache = [
  '/'
  // Avoid precaching app HTML routes to reduce stale navigations
];

// Install event - cache initial resources
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Cache addAll failed:', error);
      })
  );
  self.skipWaiting();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // IMPORTANT: Only handle GET requests - skip all others immediately
  if (request.method !== 'GET') {
    console.log('Skipping non-GET request:', request.method, request.url);
    return; // Let the browser handle it normally
  }

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip API routes, Next.js internals, and dev tools
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/_next/') ||
      url.pathname.includes('__next') ||
      url.pathname.startsWith('/_vercel') ||
      url.pathname.includes('hot-reload') ||
      url.pathname.includes('webpack') ||
      url.search.includes('_rsc=')) {
    return;
  }

  // Bypass caching for auth-related navigations to avoid stale pages
  const authPaths = ['/login', '/verify-email', '/auth/callback', '/contact-admin'];
  if (authPaths.some(p => url.pathname.startsWith(p))) {
    return; // Always let the browser fetch fresh for these routes
  }

  // Skip HTML navigations to always fetch fresh app pages
  const acceptHeader = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || acceptHeader.includes('text/html')) {
    return; // Let the browser/network handle navigations
  }

  // Handle cacheable requests (non-HTML)
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // Return cached version if available
        if (cachedResponse) {
          console.log('Serving from cache:', request.url);
          return cachedResponse;
        }

        // Fetch from network
        console.log('Fetching from network:', request.url);
        return fetch(request)
          .then(response => {
            // Only cache successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Only cache GET responses (double-check)
            if (request.method === 'GET') {
              const responseToCache = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  try {
                    cache.put(request, responseToCache);
                  } catch (error) {
                    console.warn('Failed to cache response:', error.message);
                  }
                })
                .catch(error => {
                  console.warn('Cache open failed:', error);
                });
            }

            return response;
          })
          .catch(error => {
            console.error('Fetch failed:', error);
            // Could return a custom offline page here
            throw error;
          });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Handle service worker errors
self.addEventListener('error', event => {
  console.error('Service Worker error:', event.error);
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker unhandled rejection:', event.reason);
  event.preventDefault();
});