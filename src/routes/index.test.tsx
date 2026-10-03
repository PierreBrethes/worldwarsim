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
import { afterEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { forgetSession, keepSession } from '@/data/session';
import { FrontPage } from './-index/FrontPage';
import { Route as IndexRoute } from './index';

afterEach(() => {
  cleanup();
  forgetSession();
});

/** jsdom n'évalue aucune requête média : la une en lit une pour savoir si la boucle peut jouer. */
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

/** La vraie garde de `/`, et deux pages témoins à la place des surfaces qu'elle ouvre : l'arbre
 *  réel monterait le plateau, three.js compris, pour vérifier une redirection. */
const mount = () => {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad: (context) => IndexRoute.options.beforeLoad?.(context as never),
    component: FrontPage,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/accueil',
    component: () => <p>accueil</p>,
  });
  const invitation = createRoute({
    getParentRoute: () => root,
    path: '/rejoindre/$code',
    component: function Invitation() {
      return <p>invitation {invitation.useParams().code}</p>;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([index, home, invitation]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
};

it('sert la une à qui n’a pas de session', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: fr.front.headline })).toBeTruthy();
  expect(screen.getByLabelText(fr.front.codeTitle)).toBeTruthy();
});

it('renvoie à l’accueil qui a une session', async () => {
  keepSession('un-jeton');
  const router = mount();
  expect(await screen.findByText('accueil')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/accueil');
});

it('ouvre l’invitation au sixième caractère, en capitales', async () => {
  const router = mount();
  const field = await screen.findByLabelText(fr.front.codeTitle);
  const open = screen.getByRole('button', { name: fr.front.open });

  fireEvent.change(field, { target: { value: 'k7q2p' } });
  expect(open).toHaveProperty('disabled', true);

  fireEvent.change(field, { target: { value: ' k7q2px ' } });
  expect(open).toHaveProperty('disabled', false);
  fireEvent.submit(field);

  await waitFor(() => expect(router.state.location.pathname).toBe('/rejoindre/K7Q2PX'));
});
