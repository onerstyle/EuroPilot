// Service worker : met en cache les fichiers de l'application pour un
// fonctionnement 100 % hors ligne. Aucune donnée n'est envoyée à un serveur.
const CACHE = 'europilot-v5-family-keyvalue';
const FILES = [
  './', './index.html', './app.html', './css/style.css', './manifest.webmanifest',
  './assets/icon.svg',
  './js/main.js', './js/store.js', './js/utils.js', './js/charts.js', './js/ui.js',
  './js/recurring.js', './js/defaults.js', './js/io.js', './js/family-sync.js', './js/family-sync-config.js',
  './js/views/dashboard.js', './js/views/transactions.js', './js/views/calendar.js',
  './js/views/budgets.js', './js/views/stats.js', './js/views/accounts.js',
  './js/views/years.js', './js/views/settings.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Stratégie : réseau d'abord, cache en secours (permet les mises à jour).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
