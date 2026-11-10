// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { Id } from '../../../convex/_generated/dataModel';
import { editionFixture } from '@/shell/final-edition/edition.fixture';
import { EditionPage } from './Edition';

afterEach(cleanup);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));

it('relit une édition finale depuis l’archive seule, sans plateau', async () => {
  const asked: string[] = [];
  const client = {
    watchQuery: (query: Parameters<typeof getFunctionName>[0]) => {
      asked.push(getFunctionName(query));
      return {
        localQueryResult: () => editionFixture({ mine: 'germany' }),
        onUpdate: () => () => {},
        journal: () => undefined,
      };
    },
  } as unknown as ConvexReactClient;
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <EditionPage editionId={'edition-1' as Id<'finalEditions'>} />,
  });
  const home = createRoute({ getParentRoute: () => root, path: '/accueil', component: () => null });
  render(
    <ConvexProvider client={client}>
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren([page, home]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })}
      />
    </ConvexProvider>,
  );
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
    'La France l’emporte',
  );
  expect(new Set(asked)).toEqual(new Set(['finalEdition:read']));
});
