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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { SoleSurfaceProvider } from './sole-surface';
import { SurfaceKey } from './SurfaceKey';

/**
 * **La clé des surfaces** (#179) : la dernière case de la barre basse. « À faire » avec son compte
 * sur la carte, qui ouvre le menu des surfaces ; « carte » dès qu'une surface est ouverte, qui les
 * referme. Les comptes viennent des sources du bureau — la liste « à faire », le non-lu du journal,
 * le badge du télégraphe, le rang de la dernière édition.
 */
afterEach(cleanup);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

/** Une saison dont le chantier est libre : `nextActionsOf` en tire une ligne, et une seule. */
const view = {
  arcs: [],
  captures: [],
  loadedAt: 0,
  season: { outcome: { concludedAt: null } },
  journal: [{ unread: true }, { unread: false }],
  press: { mine: { rank: 2 } },
  firstSteps: { done: [], shown: 'skipped' },
  me: {
    homePosition: [2, 47],
    hqLevel: 1,
    foundation: [],
    construction: null,
    constructionQueue: [],
    resources: {},
    buildings: [{ id: 'B-1', key: 'barracks', name: 'Caserne', regionId: 'FRA-1', level: 1 }],
    recruiting: ['B-1'],
    regions: [{ id: 'FRA-1', name: 'Rhône', point: [4.8, 45.7], linked: true }],
    outposts: [],
    slots: { total: 2, used: 2 },
    troops: [],
  },
} as unknown as PlayerView;

async function mount(shown: PlayerView = view, initial = '/plateau'): Promise<AnyRouter> {
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => (
      <SoleSurfaceProvider>
        <SurfaceKey view={shown} telegraphUnread={3} todo={<p>les lignes à faire</p>} />
      </SoleSurfaceProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('button', { name: /menu des surfaces|carte/ });
  return router;
}

const key = () => screen.getByRole('button', { name: /menu des surfaces|revenir à la carte/ });
const menu = () => screen.queryByRole('navigation', { name: fr.footBar.menuLabel });

describe('the surface key', () => {
  it('carries the count of what waits, and a closed menu', async () => {
    await mount();
    expect(key().textContent).toContain('1');
    expect(key().textContent).toContain(fr.foot.todo);
    expect(menu()).toBeNull();
  });

  it('counts the first step on show with the waits, on a new place', async () => {
    await mount({ ...view, firstSteps: { done: [], shown: 'open' } } as PlayerView);
    expect(key().textContent).toContain('2');
  });

  it('opens the menu in the desk column’s order, with the desk’s counts', async () => {
    await mount();
    act(() => key().click());

    const names = within(menu()!)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(names).toEqual([
      `${fr.footBar.menu.todo}1`,
      fr.footBar.menu.nation,
      fr.footBar.menu.research,
      fr.footBar.menu.gunnery,
      `${fr.footBar.menu.journal}1`,
      `${fr.footBar.menu.press}2ᵉ`,
      `${fr.footBar.menu.telegraph}3`,
    ]);
  });

  it('turns to « carte » while the menu is open, and closes it', async () => {
    await mount();
    act(() => key().click());

    expect(key().textContent).toContain(fr.footBar.map);
    expect(screen.queryByText(fr.foot.todo)).toBeNull();

    act(() => key().click());
    expect(menu()).toBeNull();
    expect(key().textContent).toContain(fr.foot.todo);
  });

  it('closes the menu on Escape', async () => {
    await mount();
    act(() => key().click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(menu()).toBeNull();
  });

  it('opens a surface from the menu, and « carte » takes it away', async () => {
    const router = await mount();
    act(() => key().click());
    await act(async () =>
      screen.getByRole('link', { name: new RegExp(`^${fr.footBar.menu.journal}`) }).click(),
    );

    expect(router.state.location.search).toEqual({ windows: ['journal'] });
    expect(menu()).toBeNull();
    expect(key().textContent).toContain(fr.footBar.map);

    await act(async () => key().click());
    expect(router.state.location.search).toEqual({});
    expect(key().textContent).toContain(fr.foot.todo);
  });

  it('folds the personal board when the menu opens over it', async () => {
    const router = await mount(view, '/plateau?windows=%5B%22personalBoard%22%5D');
    await act(async () => key().click());

    expect(router.state.location.search).toEqual({});
    expect(menu()).not.toBeNull();
  });

  it('opens « à faire » as a sheet carrying the board’s lines', async () => {
    await mount();
    act(() => key().click());
    act(() => screen.getByRole('button', { name: new RegExp(fr.footBar.menu.todo) }).click());

    const todo = screen.getByRole('dialog', { name: fr.nextActions.header });
    expect(within(todo).getByText('les lignes à faire')).toBeTruthy();
    expect(key().textContent).toContain(fr.footBar.map);
  });
});
