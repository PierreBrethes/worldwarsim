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
import { Protractor } from './Protractor';
import { SoleSurfaceProvider } from './sole-surface';

/**
 * **Le rapporteur** (table plein écran, 13/10) : le coin d'encre qui compte ce qui attend, six ronds
 * sur l'arc dans l'ordre de la maquette, et la feuille « à faire » qu'il tient lui-même. Les comptes viennent des sources du
 * bureau — la liste « à faire », le non-lu du journal, le badge du télégraphe, le rang de la
 * dernière édition.
 */
afterEach(cleanup);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

/** Une saison dont le chantier est libre : `nextActionsOf` en tire une ligne, et une seule. Deux dépêches dont une lue, et la deuxième place à la dernière édition. */
const view = {
  arcs: [],
  captures: [],
  loadedAt: 0,
  season: { reduction: { concludedAt: null } },
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
        <Protractor view={view} telegraphUnread={3} todo={<p>les lignes à faire</p>} />
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

const hub = () => screen.getByRole('button', { name: /ouvrir le menu/, expanded: false });

const rounds = (): ReadonlyArray<string> =>
  within(screen.getByRole('navigation'))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');

describe('the protractor', () => {
  it('lays six rounds in the mockup’s order, with the desk’s counts', async () => {
    await mount();
    act(() => hub().click());

    expect(rounds()).toEqual(['1à faire', 'chant.', 'journal1', 'presse2ᵉ', 'télég.3', 'régl.']);
  });

  it('keeps its rounds out of reach until the corner opens them, and hands focus back', async () => {
    await mount();
    expect(screen.queryByRole('link', { name: /chantiers/ })).toBeNull();

    act(() => hub().click());
    expect(screen.getByRole('link', { name: /chantiers/ })).toBeTruthy();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('link', { name: /chantiers/ })).toBeNull();
    expect(document.activeElement).toBe(hub());
  });

  it('opens the works, and folds itself away', async () => {
    const router = await mount();
    act(() => hub().click());

    await act(async () => screen.getByRole('link', { name: /chantiers/ }).click());
    expect(router.state.location.search).toEqual({ windows: ['economy'] });
    expect(hub()).toBeTruthy();
  });

  it('says « à faire » once: the corner turns to « fermer » while the arc carries it', async () => {
    await mount();
    act(() => hub().click());

    const corner = screen.getByRole('button', { name: fr.protractor.close });
    expect(corner.textContent).toBe(`×${fr.protractor.closeShort}`);
    expect(screen.getAllByText(fr.foot.todo)).toHaveLength(1);
  });

  it('opens « à faire » as a sheet carrying the board’s lines', async () => {
    await mount();
    act(() => hub().click());
    act(() => screen.getByRole('button', { name: fr.nextActions.header }).click());

    const todo = screen.getByRole('dialog', { name: fr.nextActions.header });
    expect(within(todo).getByText('les lignes à faire')).toBeTruthy();
  });
});
