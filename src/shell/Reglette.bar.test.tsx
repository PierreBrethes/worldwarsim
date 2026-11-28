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
import type { PlayerView } from '@/domain/player-view';
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

const view = (used: number, over: Record<string, unknown> = {}) =>
  ({
    mode: 'mondiale',
    arcs: [],
    loadedAt: Date.now(),
    journal: [],
    strategicPoints: [],
    season: { number: 1, elapsedHours: 4, durationHours: 168, outcome: { concludedAt: null } },
    press: null,
    me: {
      nation: 'france',
      defeated: false,
      hqLevel: 1,
      outposts: [],
      constructionQueue: [],
      construction: {
        id: 'W-0',
        name: 'Mine',
        key: 'mine',
        level: 2,
        regionName: 'Somme',
        minutesLeft: 30,
      },
      slots: { total: 2, used },
      research: { researched: [], running: null, queue: [] },
      chains: [],
      buildings: [],
      troops: [],
      funds: null,
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 40, ratePerHour: 2, cap: 400 }]),
      ),
      ...over,
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

/** **La barre collée** (#733) : un filet d'encre en bas seulement, la cellule des mouvements est
 *  une lecture, et le chantier ne s'y lit plus. */
describe('the ruler stuck to the edges', () => {
  it('has no table margin and no shadow, only a rule under it', async () => {
    await mount(view(1));
    const bar = screen.getByRole('banner');
    expect(bar.className).toContain('inset-x-0');
    expect(bar.className).not.toContain('float');
    expect(bar.className).not.toContain('border ');
    expect(bar.innerHTML).toContain('border-b');
  });

  it('reads the movements without being a button, with the taken squares in the movement amber', async () => {
    await mount(view(1));
    const label = screen.getByText(fr.resourceBand.slots);
    expect(label.closest('button')).toBeNull();
    expect(screen.getByText(fr.banner.slotsCount(1, 2))).toBeTruthy();
    const squares = label.parentElement!.querySelectorAll('i');
    expect([...squares].map((one) => one.className.includes('--arc-mine'))).toEqual([true, false]);
  });

  it('does not carry the work on the ruler any more', async () => {
    await mount(view(0));
    expect(screen.queryByText('chantier')).toBeNull();
    expect(screen.queryByText('Mine')).toBeNull();
  });

  it('names its cells at 9.2 px, and never hides the name with the width', async () => {
    await mount(view(0));
    const label = screen.getByText(fr.resourceBand.slots);
    expect(label.className).toContain('text-[9.2px]');
    expect(label.className).not.toContain('hidden');
  });
});
