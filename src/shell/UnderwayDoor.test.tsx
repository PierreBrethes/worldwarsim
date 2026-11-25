// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Underway } from '@/domain/underway';
import { Reglette } from './Reglette';

/**
 * **Le compteur de slots, porte du volet « En cours »** (#615) : un clic l'ouvre sous la réglette,
 * un second, Échap, « Fermer » ou un clic au-dehors le ferment, un clic sur une ligne recentre sans
 * le fermer, et une fiche ouverte le ferme. Tous les slots pris, le refus est dit sous les
 * mouvements ; en Blitz le compteur n'existe pas.
 */
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

const SLOTS = /^mouvements en vol/;
const NOW = Date.now();
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const minutes = (count: number) => NOW + count * 60_000;

const view = (used: number, mode: 'mondiale' | 'blitz' = 'mondiale') =>
  ({
    mode,
    loadedAt: NOW,
    journal: [],
    strategicPoints: [],
    season: {
      number: 1,
      elapsedHours: 460,
      durationHours: 168 * 4,
      outcome: { concludedAt: null },
    },
    press: { mine: { rank: 2, nickname: 'Théo' } },
    me: {
      nation: 'france',
      defeated: false,
      construction: null,
      slots: { total: 2, used },
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

const line = (id: string, label: string, left: number, over: Partial<Underway> = {}): Underway => ({
  id,
  endsAt: minutes(left),
  label,
  face: { kind: 'outpost' },
  place: { kind: 'outpost', outpostId: id },
  moving: false,
  holdsSlot: false,
  ...over,
});
const march = (id: string, label: string, left: number, over: Partial<Underway> = {}) =>
  line(id, label, left, { moving: true, holdsSlot: true, span: 60 * 60_000, ...over });

let cover: (covered: boolean) => void = () => {};

function Covered({ children }: { children: (covered: boolean) => React.ReactNode }) {
  const [covered, setCovered] = useState(false);
  cover = setCovered;
  return children(covered);
}

async function mount(
  props: { used?: number; mode?: 'mondiale' | 'blitz'; lines?: Underway[] } = {},
) {
  const onLocate = vi.fn();
  const lines = props.lines ?? [
    march('m1', 'marche → Paris', 12.5),
    line('c1', 'mine → niveau 4', 40),
    march('m2', 'marche → Chartres', 90),
  ];
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => (
      <Covered>
        {(covered) => (
          <Reglette
            view={view(props.used ?? 2, props.mode)}
            telegraphUnread={0}
            underway={lines}
            onLocate={onLocate}
            covered={covered}
          />
        )}
      </Covered>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: ['/plateau'] }),
  });
  const rendered = render(<RouterProvider router={router} />);
  await screen.findByTitle(SLOTS);
  return { onLocate, rendered };
}

const door = () => screen.getByTitle(SLOTS);
const drawer = () => screen.queryByRole('region', { name: fr.underway.drawer.title });

describe('the slots counter as the door of the underway drawer', () => {
  it('is closed at rest, and carries the next due beside the counter', async () => {
    await mount();
    expect(door().getAttribute('aria-expanded')).toBe('false');
    expect(drawer()).toBeNull();
    expect(door().textContent).toContain('00:12:30');
    expect(within(door()).getByTitle('marche → Paris').textContent).toContain('00:12:30');
  });

  it('opens on a click, with its two groups, nearest first, and closes on a second click', async () => {
    await mount();
    act(() => door().click());
    expect(door().getAttribute('aria-expanded')).toBe('true');
    const text = drawer()!.textContent!;
    expect(text).toContain(fr.underway.drawer.count(3));
    expect(text.indexOf('marche → Paris')).toBeLessThan(text.indexOf('marche → Chartres'));
    expect(text.indexOf('marche → Chartres')).toBeLessThan(text.indexOf('mine → niveau 4'));
    expect(text).toContain(fr.underway.drawer.slots(2, 2));
    act(() => door().click());
    expect(drawer()).toBeNull();
  });

  it('closes on Escape, on « Fermer » and on a click outside', async () => {
    await mount();
    act(() => door().click());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer()).toBeNull();

    act(() => door().click());
    act(() => screen.getByText(fr.underway.drawer.close).click());
    expect(drawer()).toBeNull();

    act(() => door().click());
    fireEvent.pointerDown(document.body);
    expect(drawer()).toBeNull();
  });

  it('recentres on a line and stays open', async () => {
    const { onLocate } = await mount();
    act(() => door().click());
    fireEvent.pointerDown(screen.getByTitle(fr.underway.locate('mine → niveau 4')));
    act(() => screen.getByTitle(fr.underway.locate('mine → niveau 4')).click());
    expect(onLocate).toHaveBeenCalledOnce();
    expect(drawer()).not.toBeNull();
  });

  it('says which movement frees a slot when all are taken, and marks only the lines that hold one', async () => {
    await mount();
    act(() => door().click());
    expect(drawer()!.textContent).toContain(
      `${fr.underway.drawer.freesAt(2, 'marche → Paris')}00:12:30.`,
    );
    expect(screen.getAllByTitle(fr.underway.drawer.holdsSlot)).toHaveLength(2);
  });

  it('says nothing of the sort while a slot is free, and a return holds none', async () => {
    await mount({
      used: 1,
      lines: [march('r1', 'retour → Paris', 5, { holdsSlot: false }), march('m1', 'marche', 9)],
    });
    act(() => door().click());
    expect(drawer()!.textContent).not.toContain('engagés');
    expect(screen.getAllByTitle(fr.underway.drawer.holdsSlot)).toHaveLength(1);
  });

  it('only says the slots are taken when the lines do not add up to the count', async () => {
    await mount({ lines: [march('m1', 'marche → Paris', 12.5)] });
    act(() => door().click());
    expect(drawer()!.textContent).toContain(`${fr.underway.drawer.allEngaged(2)}.`);
    expect(drawer()!.textContent).not.toContain('le prochain mouvement');
  });

  it('closes when a sheet, a window or a held pile opens, and stays closed behind it', async () => {
    await mount();
    act(() => door().click());
    expect(drawer()).not.toBeNull();
    act(() => cover(true));
    expect(drawer()).toBeNull();
    act(() => cover(false));
    expect(drawer()).toBeNull();
  });

  it('is not there in a Blitz', async () => {
    const root = createRootRoute();
    const board = createRoute({
      getParentRoute: () => root,
      path: '/plateau',
      component: () => <Reglette view={view(0, 'blitz')} telegraphUnread={0} underway={[]} />,
    });
    const router = createRouter({
      routeTree: root.addChildren([board]),
      history: createMemoryHistory({ initialEntries: ['/plateau'] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByText(/BLITZ|blitz/i, {}, { timeout: 1000 }).catch(() => {});
    expect(screen.queryByTitle(SLOTS)).toBeNull();
  });
});
