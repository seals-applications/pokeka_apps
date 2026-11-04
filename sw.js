// ARずかん Service Worker
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const IMAGES = 'card-images-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // カード画像: キャッシュ優先（画像は不変）
  if (url.pathname.includes('/storage/v1/object/public/card-images/')) {
    e.respondWith(
      caches.open(IMAGES).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Supabase REST API: 常にネットワーク（キャッシュしない）
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return;

  // アプリ本体・フォント・CDN: ネットワーク優先、オフライン時はキャッシュ
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
