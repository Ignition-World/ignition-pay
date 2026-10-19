'use client'

import { useEffect, useState } from 'react'

export function ServiceWorkerRegistration() {
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    // Check if service workers and background sync are supported
    const supported = 'serviceWorker' in navigator && 'serviceWorker' in window && 'SyncManager' in window
    setIsSupported(supported)

    if (!supported) {
      console.warn('Service Worker or Background Sync not supported in this browser')
      return
    }

    // Register service worker
    registerServiceWorker()

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)

    // Listen for online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      console.log('Service Worker registered:', registration.scope)

      // Register background sync
      if ('sync' in registration) {
        await registration.sync.register('transaction-queue')
        console.log('Background sync registered')
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error)
    }
  }

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === 'PROCESS_TRANSACTION_QUEUE') {
      console.log('Service worker requested queue processing')
      // This will be handled by the queue processor hook
      window.dispatchEvent(new CustomEvent('processTransactionQueue'))
    }
  }

  const handleOnline = () => {
    console.log('Network connection restored')
    // Trigger queue processing when coming back online
    window.dispatchEvent(new CustomEvent('processTransactionQueue'))
  }

  const handleOffline = () => {
    console.log('Network connection lost')
  }

  return null
}
