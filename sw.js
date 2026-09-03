const VERSION = 'blood-qc-v5.3.2';
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  // App contains live clinical records. Always use the network; service worker exists for installability only.
  event.respondWith(fetch(event.request));
});
