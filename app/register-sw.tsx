'use client'

import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          // First, unregister any old service workers
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            if (registration.scope.includes(window.location.origin)) {
              await registration.unregister();
              console.log('Unregistered old service worker:', registration.scope);
            }
          }

          // Wait a bit for cleanup
          await new Promise(resolve => setTimeout(resolve, 100));

          // Register the new service worker
          const registration = await navigator.serviceWorker.register('/sw.js', {
            updateViaCache: 'none' // Always fetch fresh SW
          });

          // Force update check
          await registration.update();

          console.log('ServiceWorker registration successful:', registration.scope);

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated') {
                  console.log('New service worker activated');
                }
              });
            }
          });

        } catch (err) {
          console.log('ServiceWorker registration failed:', err);
        }
      };

      // Register on load
      if (document.readyState === 'loading') {
        window.addEventListener('load', registerSW);
      } else {
        registerSW();
      }
    }
  }, [])

  return null
}