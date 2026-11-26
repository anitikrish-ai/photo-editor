const C = 'photo-studio-v3', SHELL = ['./', 'index.html', 'style.css', 'app.mjs', 'engine.mjs', 'ai.mjs', 'lg-core.mjs', 'lg.css', 'shims/react.mjs', 'shims/react-jsx-runtime.mjs', 'shims/react-dom.mjs', 'vendor/react.production.min.js', 'vendor/react-dom.production.min.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => clients.claim())));
// stale-while-revalidate for the app shell: instant + offline, updates in the background
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(hit => { const net = fetch(e.request).then(r => { if (r.ok) caches.open(C).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit); return hit || net; }));
});
