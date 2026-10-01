// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { NotFoundScreen } from './ErrorScreen';

afterEach(cleanup);

/**
 * TanStack's default for an unknown address is a bare English `<p>Not Found</p>`, in ink on the
 * dark desk. The game speaks French only, and every other failure already has a screen.
 */
it('answers an unknown address in French, with a way back home', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/nulle-part'] }),
    defaultNotFoundComponent: NotFoundScreen,
  });

  render(<RouterProvider router={router} />);

  expect(await screen.findByText(fr.notFoundScreen.title)).toBeTruthy();
  expect(screen.getByText(fr.notFoundScreen.message)).toBeTruthy();
  expect(screen.getByRole('button', { name: fr.errorScreen.backHome })).toBeTruthy();
  expect(screen.queryByText('Not Found')).toBeNull();
});
