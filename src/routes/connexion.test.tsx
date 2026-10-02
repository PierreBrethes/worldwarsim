// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { ConvexProvider } from 'convex/react';
import type { ConvexReactClient } from 'convex/react';
import { ConvexError } from 'convex/values';
import { afterEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { ConnectedSignIn } from './connexion';

afterEach(cleanup);

/** jsdom n'évalue aucune requête média : la feuille d'entrée en lit une pour choisir son fond. */
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

/** A client whose actions are refused, as a wrong password is. */
const refusingClient = {
  action: () => Promise.reject(new ConvexError({ code: 'BAD_CREDENTIALS' })),
} as unknown as ConvexReactClient;

const mount = () => {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: ConnectedSignIn });
  return render(
    <ConvexProvider client={refusingClient}>
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren([index]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })}
      />
    </ConvexProvider>,
  );
};

/**
 * The first screen of the game named its fields only by their placeholder, showed no focus, and
 * said a refusal in a paragraph nobody announced: three failures of the same form for anyone
 * who does not read it with a mouse and a pair of eyes.
 */
it('names each field by a real label', async () => {
  mount();
  expect(await screen.findByLabelText(fr.auth.nicknameLabel)).toBeTruthy();
  expect(screen.getByLabelText(fr.auth.passwordLabel)).toBeTruthy();
});

it('announces a refusal and ties it to the fields it concerns', async () => {
  mount();
  const nickname = await screen.findByLabelText(fr.auth.nicknameLabel);
  const password = screen.getByLabelText(fr.auth.passwordLabel);
  fireEvent.change(nickname, { target: { value: 'Pierre' } });
  fireEvent.change(password, { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: fr.auth.loginSubmit }));

  const alert = await waitFor(() => screen.getByRole('alert'));
  expect(alert.textContent).toBe(fr.errors.BAD_CREDENTIALS());
  for (const field of [nickname, password]) {
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain(alert.id);
  }
});
