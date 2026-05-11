var CACHE_NAME = 'smc-v1';
var PRECACHE = ['/', '/css/styles.css', '/js/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(PRECACHE); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).catch(function () { return caches.match(e.request); })
  );
});

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  var title = data.title || 'Surf My Cycle';
  var options = {
    body: data.body || '记录一下现在的状态吧',
    icon: '/assets/icons/smc-192.png',
    badge: '/assets/icons/smc-192.png',
    tag: data.tag || 'smc-reminder',
    renotify: true,
    data: { url: '/?action=quick-checkin', action: (data.data && data.data.action) || 'quick-checkin' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var targetUrl = (e.notification.data && e.notification.data.url) || '/?action=quick-checkin';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.location.origin) !== -1 && 'focus' in list[i]) {
          list[i].postMessage({ type: 'notification-click', action: 'quick-checkin' });
          return list[i].focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
