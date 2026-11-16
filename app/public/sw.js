/* Minimal offline shell cache for J.A.R.V.I.S */
const CACHE = 'jarvis-shell-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req)
        if (fresh.ok) {
          const cache = await caches.open(CACHE)
          cache.put(req, fresh.clone())
        }
        return fresh
      } catch {
        const cached = await caches.match(req)
        if (cached) return cached
        if (req.mode === 'navigate') {
          const shell = await caches.match(new URL('./index.html', location.href).href)
          if (shell) return shell
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }
    })(),
  )
})
