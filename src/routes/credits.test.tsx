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
import { afterEach, expect, it, vi } from 'vitest';
import { Credits } from './credits';

afterEach(cleanup);

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

it('names the BKG, whose attribution the licence requires', async () => {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: Credits });
  render(
    <RouterProvider
      router={createRouter({
        routeTree: root.addChildren([index]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })}
    />,
  );
  expect((await screen.findAllByText(/GeoBasis-DE \/ BKG/)).length).toBeGreaterThan(0);
  expect(screen.getByText(/données modifiées/)).toBeTruthy();
  expect(document.querySelector('a[href="https://www.govdata.de/dl-de/by-2-0"]')).not.toBeNull();
});
