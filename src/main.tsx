import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConvexProvider } from 'convex/react';
import { clientConvex } from './donnees/clientConvex';
import { appliquerEchelleHud, lireEchelleHud } from './donnees/reglages';
import { routeTree } from './routeTree.gen';
import './styles/index.css';

appliquerEchelleHud(lireEchelleHud());

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const application = <RouterProvider router={router} />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clientConvex ? <ConvexProvider client={clientConvex}>{application}</ConvexProvider> : application}
  </StrictMode>,
);
