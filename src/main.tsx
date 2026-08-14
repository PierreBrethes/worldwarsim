import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConvexProvider } from 'convex/react';
import { convexClient } from './data/convexClient';
import { applyHudScale, readHudScale } from './data/settings';
import { routeTree } from './routeTree.gen';
import './styles/index.css';

applyHudScale(readHudScale());

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const application = <RouterProvider router={router} />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convexClient ? <ConvexProvider client={convexClient}>{application}</ConvexProvider> : application}
  </StrictMode>,
);
