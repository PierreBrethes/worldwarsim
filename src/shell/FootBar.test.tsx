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
 * **La barre de pied** (piste A, passe 2, A1 à A5) : cinq entrées dans l'ordre de la maquette,
 * un étage que « plus » ajoute et replie, et les deux feuilles qu'elle tient elle-même. Les
 * comptes viennent des sources du bureau — la liste « à faire », le non-lu du journal, le badge
 * du télégraphe, le rang de la dernière édition.
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

    expect(entries()).toEqual(['à faire1', 'journal1', 'télégraphe3', 'presse2e', 'plus']);
  });

  it('adds a floor under « plus », and folds it on a second touch', async () => {
    await mount();
    const more = screen.getByRole('button', { name: fr.foot.more });

    act(() => more.click());
    expect(entries().slice(0, 5)).toEqual([
      'nation',
      'économie',
      'abaque de tir',
      'réglages',
      'calques',
    ]);

    act(() => more.click());
    expect(entries()).toHaveLength(5);
  });

  it('folds the floor when another entry opens', async () => {
    const router = await mount();
    act(() => screen.getByRole('button', { name: fr.foot.more }).click());
    expect(entries()).toHaveLength(10);

    await act(async () => screen.getByRole('link', { name: /journal/ }).click());
    expect(entries()).toHaveLength(5);
    expect(router.state.location.search).toEqual({ windows: ['journal'] });
  });

  it('keeps the floor open under the layers sheet, eight toggles on two columns', async () => {
    await mount();
    act(() => screen.getByRole('button', { name: fr.foot.more }).click());
    act(() => screen.getByRole('button', { name: fr.foot.layers }).click());

    const layers = screen.getByRole('dialog', { name: fr.foot.layersTitle });
    expect(within(layers).getAllByRole('button', { pressed: true }).length).toBeGreaterThan(0);
    expect(
      within(layers)
        .getAllByRole('button')
        .filter((toggle) => toggle.hasAttribute('aria-pressed')),
    ).toHaveLength(8);
    expect(entries()).toHaveLength(10);
  });

  it('opens « à faire » as a sheet carrying the board’s lines', async () => {
    await mount();
    act(() => screen.getByRole('button', { name: /à faire/ }).click());

    const todo = screen.getByRole('dialog', { name: fr.nextActions.header });
    expect(within(todo).getByText('les lignes à faire')).toBeTruthy();
  });
});
