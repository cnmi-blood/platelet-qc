const VERSION = 'blood-component-qc-platelet-v4.7.0';
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  // App contains live clinical records. Always use the network; service worker exists for installability only.
  event.respondWith(fetch(event.request));
});
