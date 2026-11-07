const cacheName = 'bible-henyo-v2';
const assets = ['./', './index.html', './style.css', './app.js', './words.js',
  './manifest.webmanifest', './icon.svg', './icon.png', './icon-512.png',
  './Bible-Henyo-Word-List.pdf'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('bible-henyo-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    const cached = await cache.match(event.request, {ignoreSearch: event.request.mode === 'navigate'});
    return cached || fetch(event.request);
  }));
});
