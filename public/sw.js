/*
 * Ce service worker ne fait que les notifications : aucun cache, aucune interception de `fetch`.
 * Il reste en JavaScript simple dans `public/` — pas d'outil de build, pas de dépendance.
 */

self.addEventListener('install', () => self.skipWaiting());

// Prendre la main sur les onglets déjà ouverts : sans cela `client.navigate` leur est refusé.
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'La Manchette', {
      body: payload.body || '',
      tag: payload.tag,
      icon: payload.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/plateau', seasonId: payload.seasonId || null },
    }),
  );
});

/**
 * **Le plateau lit sa saison dans `localStorage`, qu'un service worker ne peut pas écrire** : la
 * saison voyage donc dans l'adresse (`season`), et c'est le plateau qui la retient. Une adresse
 * d'un autre site n'est jamais suivie.
 */
function addressOf(data) {
  const target = new URL(data.url || '/plateau', self.location.origin);
  if (target.origin !== self.location.origin) return new URL('/plateau', self.location.origin);
  if (data.seasonId) target.searchParams.set('season', data.seasonId);
  return target;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = addressOf(event.notification.data || {});
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const mine = open.find((client) => new URL(client.url).origin === self.location.origin);
      if (mine) {
        try {
          const navigated = await mine.navigate(target.href);
          await (navigated || mine).focus();
          return;
        } catch {
          // Un onglet qu'on ne peut pas piloter : on en ouvre un autre.
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
