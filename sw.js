var CACHE_NAME = 'smc-v2';
var PRECACHE = ['/', '/css/styles.css', '/js/app.js', '/js/memory-integration.js', '/manifest.webmanifest', '/assets/icons/smc-icon.svg'];

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
  var req = e.request;
  if (req.method !== 'GET') return;
  // API：始终走网络，保证数据新鲜
  if (req.url.indexOf('/api/') !== -1) return;

  var isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  // HTML 文档：网络优先（新部署能立刻生效），离线再回退缓存
  if (isNavigation) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('/'); });
      })
    );
    return;
  }

  // 静态资源(css/js/图标)：缓存优先 + 后台更新（stale-while-revalidate）
  // 命中缓存时瞬间返回，不再每次等网络——解决「每次打开都慢」
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
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
