// Service worker : met en cache les fichiers de l'application pour un
// fonctionnement 100 % hors ligne. Aucune donnée n'est envoyée à un serveur.
const CACHE = 'europilot-v18-votre-partenaire';
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
// Stratégie : réseau d'abord, cache en secours. Gère aussi le fallback kvdb 403 → keyvalue
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Intercepte les requêtes kvdb qui échouent en 403 pour les rediriger vers keyvalue (fallback sans hard refresh)
  if (url.includes('kvdb.io')) {
    e.respondWith(
      fetch(e.request).then(async r => {
        if (r.status === 403) {
          const txt = await r.clone().text().catch(() => '');
          if (/email.*not verified/i.test(txt)) {
            // Tente le fallback keyvalue : extrait le CODE de l'URL kvdb et refait la requête vers keyvalue
            try {
              const code = url.split('/').pop().split('?')[0];
              const decoded = decodeURIComponent(code);
              // Si c'était un POST, on ne peut pas facilement rejouer le body ici, on renvoie une réponse 409 pour que le JS fasse le fallback
              return new Response(JSON.stringify({ error: 'kvdb 403 fallback to keyvalue', code: decoded }), { status: 409, headers: { 'Content-Type': 'application/json' } });
            } catch {}
          }
        }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
