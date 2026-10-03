import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConvexProvider } from 'convex/react';
import { convexClient } from './data/convexClient';
import { NotFoundScreen } from './shell/ErrorScreen';
import { applyHudScale, readHudScale } from './data/settings';
import { routeTree } from './routeTree.gen';
import './styles/index.css';

applyHudScale(readHudScale());

/**
 * **Un déploiement efface les chunks du précédent.** Un onglet resté ouvert garde l'index
 * d'avant en mémoire ; le premier `lazy()` qu'il ouvre demande un fichier que le nouveau build
 * ne contient plus, et rien ne peut le rattraper au rendu — le module n'existe pas. Recharger
 * reprend l'index courant, donc les bons hachages, et le joueur retombe sur sa partie : la
 * session vit dans `localStorage` et la carte se relit depuis le serveur.
 *
 * L'autre moitié du correctif est côté serveur (`deploiement/nginx.conf`) : un `index.html`
 * caché par heuristique redemanderait les mêmes fichiers morts et ce rechargement tournerait
 * en rond. D'où le garde-fou d'une minute — si le rechargement échoue lui aussi, boucler ne
 * répare rien et masque la panne.
 */
const RELOAD_GUARD = 'wws-chunk-reload';

window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0);
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  window.location.reload();
});

/**
 * **Le service worker ne fait que les notifications** (`public/sw.js`) : l'inscrire n'abonne
 * personne, et la permission ne se demande que depuis la case des Réglages.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  });
}

const router = createRouter({ routeTree, defaultNotFoundComponent: NotFoundScreen });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const application = <RouterProvider router={router} />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convexClient ? (
      <ConvexProvider client={convexClient}>{application}</ConvexProvider>
    ) : (
      application
    )}
  </StrictMode>,
);
