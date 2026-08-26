/**
 * Service Worker registration and management utilities
 */

const SW_URL = '/sw.js';

/**
 * Register the service worker
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: '/',
    });

    console.log('Service worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('Service worker update found');

      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available
          console.log('New service worker available');
          dispatchUpdateEvent();
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
}

/**
 * Unregister all service workers
 * @returns {Promise<boolean>}
 */
export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const success = await registration.unregister();
    console.log('Service worker unregistered:', success);
    return success;
  } catch (error) {
    console.error('Service worker unregister failed:', error);
    return false;
  }
}

/**
 * Clear all service worker caches
 * @returns {Promise<void>}
 */
export async function clearServiceWorkerCache() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      console.log('Cache cleared:', event.data);
      resolve();
    };

    registration.active?.postMessage(
      { type: 'CLEAR_CACHE' },
      [messageChannel.port2]
    );
  });
}

/**
 * Skip waiting and activate new service worker
 * @returns {Promise<void>}
 */
export async function skipWaiting() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Dispatch custom event when service worker update is available
 */
function dispatchUpdateEvent() {
  window.dispatchEvent(new CustomEvent('sw-update-available'));
}

/**
 * Check if service worker is supported and active
 * @returns {boolean}
 */
export function isServiceWorkerActive() {
  return !!(navigator.serviceWorker?.controller);
}

/**
 * Check if app can work offline
 * @returns {Promise<boolean>}
 */
export async function canWorkOffline() {
  if (!('caches' in window)) {
    return false;
  }

  try {
    const cache = await caches.open('olympics-static-v1');
    const response = await cache.match('/index.html');
    return !!response;
  } catch {
    return false;
  }
}

export default {
  registerServiceWorker,
  unregisterServiceWorker,
  clearServiceWorkerCache,
  skipWaiting,
  isServiceWorkerActive,
  canWorkOffline,
};
