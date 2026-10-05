// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { ConvexProvider } from 'convex/react';
import type { ConvexReactClient, Watch } from 'convex/react';
import { afterEach, expect, it } from 'vitest';
import { forgetSession, keepSession } from '@/data/session';
import { SignedIn, opensWithoutAccount } from './__root';

/**
 * **La garde de la porte ne doit pas tourner à vide** (ADR 0022). `SignedIn` monte à chaque
 * feuille du jeu, et la boucle de rendu qu'elle a portée le 13/09 — React #301, toutes pages
 * confondues — ne venait pas d'une règle mais d'une **identité** : `useQueries` compare son objet
 * de requêtes par référence, et un littéral neuf à chaque rendu le fait poser un `setState`
 * pendant le rendu, qui refait un littéral.
 *
 * C'est le test qui manquait au miroir, et il ne regarde pas ce que la porte affiche — `null` le
 * temps d'un aller-retour, ce qui est déjà écrit ailleurs. Il compte les **rendus**, parce que
 * c'est la seule chose que la panne disait et que rien ne mesurait.
 */

/** Un client dont la requête ne répond jamais : c'est l'état où la boucle se déclenchait, le
 *  temps de l'aller-retour, et le seul qui se monte sans routeur — la porte y rend `null` au
 *  lieu de sortir un `Outlet` ou un `Navigate`. */
const pendingClient = (): ConvexReactClient => {
  const watch: Watch<unknown> = {
    localQueryResult: () => undefined,
    onUpdate: () => () => {},
    journal: () => undefined,
  };
  return { watchQuery: () => watch } as unknown as ConvexReactClient;
};

/** Assez large pour tolérer un rendu de plus que React ferait légitimement, assez serré pour
 *  tomber sur une boucle : React s'arrête à vingt-cinq rendus imbriqués, et #301 est ce mur. */
const RENDER_CEILING = 5;

const counting = (renders: { count: number }) => () => {
  renders.count += 1;
  return <SignedIn />;
};

afterEach(() => {
  cleanup();
  forgetSession();
});

it('ne rend la porte qu’un nombre borné de fois, session en main', () => {
  keepSession('un-jeton');
  const renders = { count: 0 };
  const Counted = counting(renders);

  render(
    <ConvexProvider client={pendingClient()}>
      <Counted />
    </ConvexProvider>,
  );

  expect(renders.count).toBeLessThanOrEqual(RENDER_CEILING);
});

/**
 * **Le renvoi de la garde remplace, il n'empile pas.** Empilé, le retour du navigateur rendait
 * la feuille gardée, qui renvoyait encore : on ne remontait jamais plus haut que la connexion.
 */
it('renvoie à la connexion sans laisser la feuille gardée dans l’historique', async () => {
  const root = createRootRoute();
  const page = (path: string, component: () => React.ReactNode) =>
    createRoute({ getParentRoute: () => root, path, component });
  const router = createRouter({
    routeTree: root.addChildren([
      page('/', () => null),
      page('/accueil', () => <SignedIn />),
      page('/connexion', () => null),
    ]),
    history: createMemoryHistory({ initialEntries: ['/', '/accueil'] }),
  });
  render(
    <ConvexProvider client={pendingClient()}>
      <RouterProvider router={router} />
    </ConvexProvider>,
  );
  await waitFor(() => expect(router.state.location.pathname).toBe('/connexion'));

  act(() => router.history.back());

  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
});

/**
 * **Trois feuilles s'ouvrent sans compte** : la une (`/`), qui mène aux deux autres,
 * `/connexion`, qui en donne un, et `/rejoindre/CODE`, qui en donne un *et* une place. Tout le
 * reste reste derrière la porte — une seule condition, pas une seconde garde.
 */
it('ouvre la une, la connexion et les invitations, et rien d’autre, sans compte', () => {
  expect(opensWithoutAccount('/')).toBe(true);
  expect(opensWithoutAccount('/connexion')).toBe(true);
  expect(opensWithoutAccount('/rejoindre/K7Q2PX')).toBe(true);

  for (const closed of ['/accueil', '/salon', '/plateau', '/rejoindre', '/connexion/autre']) {
    expect(opensWithoutAccount(closed), closed).toBe(false);
  }
});
