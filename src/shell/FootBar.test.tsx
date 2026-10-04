// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { FootBar } from './FootBar';
import { SoleSurfaceProvider } from './sole-surface';

/**
 * **La barre de pied** (refonte mobile, 1a) : cinq entrées dans l'ordre de la maquette — « à
 * faire » au centre —, et la feuille qu'elle tient elle-même. Les comptes viennent des sources du
 * bureau — la liste « à faire », le non-lu du journal, le badge du télégraphe, le rang de la
 * dernière édition.
 */
afterEach(cleanup);

/** Une saison dont le chantier est libre : `nextActionsOf` en tire une ligne, et une seule. Deux dépêches dont une lue, et la deuxième place à la dernière édition. */
const view = {
  arcs: [],
  loadedAt: 0,
  journal: [{ unread: true }, { unread: false }],
  press: { mine: { rank: 2 } },
  me: {
    homePosition: [2, 47],
    hqLevel: 1,
    foundation: [],
    construction: null,
    constructionQueue: [],
    resources: {},
    siteSlots: [],
    buildings: [{ id: 'B-1', key: 'barracks', name: 'Caserne', regionId: 'FRA-1', level: 1 }],
    recruiting: ['B-1'],
    regions: [{ id: 'FRA-1', name: 'Rhône', point: [4.8, 45.7], linked: true }],
    outposts: [],
    slots: { total: 2, used: 2 },
    troops: [],
  },
} as unknown as PlayerView;

async function mount(): Promise<AnyRouter> {
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => (
      <SoleSurfaceProvider>
        <FootBar view={view} telegraphUnread={3} todo={<p>les lignes à faire</p>} />
      </SoleSurfaceProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: ['/plateau'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('navigation');
  return router;
}

const entries = (): ReadonlyArray<string> =>
  within(screen.getByRole('navigation'))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');

describe('the foot bar', () => {
  it('lays five entries in the mockup’s order, with the desk’s counts', async () => {
    await mount();

    expect(entries()).toEqual(['chantiers', 'journal1', '1à faire', 'presse2ᵉ', 'télégraphe3']);
  });

  it('opens the works, which left « plus » for the bar itself', async () => {
    const router = await mount();

    await act(async () => screen.getByRole('link', { name: /chantiers/ }).click());
    expect(router.state.location.search).toEqual({ windows: ['economy'] });
  });

  it('opens « à faire » as a sheet carrying the board’s lines', async () => {
    await mount();
    act(() => screen.getByRole('button', { name: /à faire/ }).click());

    const todo = screen.getByRole('dialog', { name: fr.nextActions.header });
    expect(within(todo).getByText('les lignes à faire')).toBeTruthy();
  });
});
