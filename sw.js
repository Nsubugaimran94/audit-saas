const CACHE_NAME = 'auditlog-v1'
const ASSETS = [
    '/',
    '/index.html',
    '/history.html',
    '/styles.css',
    '/parse.js',
    '/audit.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
]

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    )
    self.skipWaiting()
})

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    )
    self.clients.claim()
})

self.addEventListener('fetch', event => {
    const req = event.request

    // Only handle GET requests
    if (req.method !== 'GET') return

    // Use network-first for navigation / HTML requests so the app shows updates quickly
    const acceptHeader = req.headers.get('accept') || ''
    const isHTML = req.mode === 'navigate' || acceptHeader.includes('text/html')

    if (isHTML) {
        event.respondWith(
            fetch(req)
                .then(networkRes => {
                    // Update the cache with the latest HTML
                    const copy = networkRes.clone()
                    caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy))
                    return networkRes
                })
                .catch(() => caches.match('/index.html'))
        )
        return
    }

    // For other assets use cache-first, but update cache with network response when available
    event.respondWith(
        caches.match(req).then(cached => {
            const networkFetch = fetch(req).then(networkRes => {
                // Save a copy in the cache for offline use
                caches.open(CACHE_NAME).then(cache => {
                    try { cache.put(req, networkRes.clone()) } catch (e) { /* ignore */ }
                })
                return networkRes
            }).catch(() => null)

            return cached || networkFetch
        })
    )
})