// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView, StrategicPointView } from '@/domain/player-view';
import { Reglette } from './Reglette';

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(cleanup);

const point = (id: string, nation: string | null, mine = false): StrategicPointView =>
  ({
    id,
    key: 'tangier',
    holder: nation === null ? null : { nation, heldMs: 0 },
    mine,
    contested: false,
  }) as StrategicPointView;

const view = (
  points: ReadonlyArray<StrategicPointView>,
  race: { leaderNation: string; endsAt: number } | null,
) =>
  ({
    mode: 'mondiale',
    loadedAt: Date.now(),
    journal: [],
    strategicPoints: points,
    season: {
      number: 1,
      elapsedHours: 4,
      durationHours: 168,
      outcome: { concludedAt: null },
      race,
    },
    press: null,
    me: {
      nation: 'france',
      defeated: false,
      construction: null,
      slots: { total: 2, used: 0 },
      research: { researched: [], running: null, queue: [] },
      chains: [],
      buildings: [],
      troops: [],
      funds: null,
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 40, ratePerHour: 2, cap: 400 }]),
      ),
    },
  }) as unknown as PlayerView;

async function mount(shown: PlayerView) {
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => <Reglette view={shown} telegraphUnread={0} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: ['/plateau'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByText(fr.resourceBand.slots);
}

/** **La course aux Sept sur la réglette** (#670) : la cellule ouvre la Presse, dit le compte à
 *  rebours de `race` seul, et se tait sans points. */
describe('the race cell of the ruler', () => {
  it('opens the press on a click, without a new URL parameter', async () => {
    await mount(view([point('a', 'france', true), point('b', null)], null));
    const cell = screen.getByTitle(new RegExp(`^${fr.points.race.title}`));
    expect(cell.getAttribute('href')).toContain(encodeURIComponent('["press"]'));
    expect(cell.textContent).toContain('1 / 4');
    expect(cell.textContent).not.toContain('victoire');
  });

  it('says the leader and the time left when the race runs, whoever holds the marks', async () => {
    const endsAt = Date.now() + 23 * 3_600_000 + 12 * 60_000 + 30_000;
    await mount(view([point('a', 'france', true)], { leaderNation: 'germany', endsAt }));
    const cell = screen.getByTitle(new RegExp(`^${fr.points.race.title}`));
    expect(cell.textContent).toContain('Allemagne · victoire dans 23 h 12');
    expect(cell.getAttribute('title')).toContain('Allemagne');
  });

  it('is absent when the season has no points', async () => {
    await mount(view([], null));
    expect(screen.queryByTitle(new RegExp(`^${fr.points.race.title}`))).toBeNull();
  });
});
