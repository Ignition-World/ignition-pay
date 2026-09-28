const CACHE_NAME = 'ignition-pay-v1'
const SYNC_TAG = 'transaction-queue'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([])
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processTransactionQueue())
  }
})

async function processTransactionQueue() {
  try {
    const clients = await self.clients.matchAll()
    const client = clients[0]

    if (!client) {
      console.warn('No client found to process transaction queue')
      return
    }

    // Request the client to process the queue
    client.postMessage({ type: 'PROCESS_TRANSACTION_QUEUE' })
  } catch (error) {
    console.error('Error processing transaction queue:', error)
  }
}

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request)
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REGISTER_SYNC') {
    event.waitUntil(
      self.registration.sync.register(SYNC_TAG).catch((error) => {
        console.error('Sync registration failed:', error)
      })
    )
  }
})
