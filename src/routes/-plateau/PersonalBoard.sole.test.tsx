// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import {
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
import type { Seat } from '@/data/session';
import { BottomSheet } from '@/shell/BottomSheet';
import { SoleSurfaceProvider, useRoseSurface } from '@/shell/sole-surface';
import { PersonalBoard } from './PersonalBoard';
import {
  type BoardSearch,
  withWindow,
  withoutWindow,
  yieldNavigation,
  yieldWindow,
} from './board-search';

/**
 * **Au téléphone, une seule surface à la fois** (#596) : le plateau déplié réclame la place comme
 * la feuille ; le replié ne ferme rien ; le plateau cédé garde le site sélectionné. La rose de
 * `WorldMap` réclame par `useRoseSurface`, le même hook que `Rose` ici : la carte ne se monte pas
 * sous jsdom.
 */
const client = {
  watchQuery: () => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => {},
    journal: () => undefined,
  }),
  mutation: () => Promise.resolve(),
} as unknown as ConvexReactClient;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.animate = () => ({}) as Animation;
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    media: '',
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SEAT = { token: 't', seasonId: 's' } as unknown as Seat;
const view = {
  loadedAt: 0,
  mode: 'mondiale',
  captures: [],
  arcs: [],
  boardRead: null,
  surveyedInstallations: [],
  buildCatalog: new Proxy({}, { get: () => ({ minutes: 1, cost: { steel: 10 }, lockedBy: null }) }),
  me: {
    nation: 'france',
    defeated: false,
    troops: [],
    stationedCargo: [],
    construction: null,
    constructionQueue: [],
    recruiting: [],
    regions: [{ id: 'FR-NOR', name: 'Nord', linked: true }],
    buildings: [],
    foundation: [],
    extraction: [],
    evacuated: [],
    outposts: [],
    chains: [],
    hqLevel: 0,
    upkeep: {},
    research: { researched: [], running: null, queue: [] },
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 340, ratePerHour: 4, cap: 400 }]),
    ),
  },
} as unknown as PlayerView;

/** La rose de `WorldMap`, réduite à sa réclamation. */
function Rose({ at, onClose }: { at: boolean; onClose: () => void }) {
  useRoseSurface(at ? {} : null, onClose);
  return at ? <p>rose</p> : null;
}

let search: BoardSearch = {};
let setRose: (open: boolean) => void = () => {};
let setSheet: (open: boolean) => void = () => {};
let setResearch: (open: boolean) => void = () => {};
let roseClosed = 0;
let mountBoard: (mounted: boolean) => void = () => {};

/** Le plateau câblé comme `plateau.tsx` : l'adresse est `search`, `onYield` la garde du site. */
function Table({
  opened = true,
  late = false,
  yields = true,
}: {
  opened?: boolean;
  /** The board mounts after the rose and the sheet are open. */
  late?: boolean;
  /** `false`: the board keeps its default `onYield`. */
  yields?: boolean;
}) {
  const [mounted, setMounted] = useState(!late);
  mountBoard = setMounted;
  const [state, setState] = useState<BoardSearch>(
    opened ? { ...withWindow({}, 'personalBoard'), building: 'B-barracks' } : { building: 'B' },
  );
  const [rose, openRose] = useState(false);
  const [sheet, openSheet] = useState(false);
  search = state;
  setRose = openRose;
  setSheet = openSheet;
  setResearch = (open) =>
    setState((was) => (open ? withWindow(was, 'research') : withoutWindow(was, 'research')));
  const windows = state.windows ?? [];
  return (
    <ConvexProvider client={client}>
      <SoleSurfaceProvider>
        {mounted && (
          <PersonalBoard
            view={view}
            seat={SEAT}
            open={windows.includes('personalBoard')}
            onOpen={(open) =>
              setState((was) =>
                open ? withWindow(was, 'personalBoard') : withoutWindow(was, 'personalBoard'),
              )
            }
            {...(yields
              ? { onYield: () => setState((was) => yieldWindow(was, 'personalBoard')) }
              : {})}
            research={windows.includes('research')}
            onResearch={() => {}}
            front
            focused={null}
            site={null}
            onDeselectSite={() => {}}
            onOpenSiteSheet={() => {}}
            onHoldTile={() => {}}
            onPlaceTile={() => false}
            maquetteAt={null}
            placing={null}
          />
        )}
        <Rose
          at={rose}
          onClose={() => {
            roseClosed += 1;
            openRose(false);
          }}
        />
        {sheet && (
          <BottomSheet title="Infanterie" onClose={() => openSheet(false)}>
            <p>fiche</p>
          </BottomSheet>
        )}
        {windows.includes('research') && (
          <BottomSheet title="Recherche" onClose={() => setResearch(false)}>
            <p>arbre</p>
          </BottomSheet>
        )}
      </SoleSurfaceProvider>
    </ConvexProvider>
  );
}

const unfolded = () => screen.queryByRole('button', { name: fr.footBar.grip.full }) !== null;

describe('one surface at a time under the threshold', () => {
  it('folds the unfolded board when the rose opens, and closes the rose when it unfolds again', () => {
    render(<Table />);
    expect(unfolded()).toBe(true);
    act(() => setRose(true));
    expect(search.windows ?? []).not.toContain('personalBoard');
    expect(screen.getByText('rose')).toBeTruthy();
    act(() => screen.getByRole('button', { name: fr.footBar.grip.open }).click());
    expect(screen.queryByText('rose')).toBeNull();
    expect(unfolded()).toBe(true);
  });

  it('folds the board when a sheet opens, and keeps the selected site', () => {
    render(<Table />);
    act(() => setSheet(true));
    expect(search.windows ?? []).not.toContain('personalBoard');
    expect(search.building).toBe('B-barracks');
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
  });

  it('folds the board behind the research window, which claims by itself', () => {
    render(<Table />);
    act(() => setResearch(true));
    expect(unfolded()).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Recherche' })).toBeTruthy();
    expect(search.building).toBe('B-barracks');
  });

  it('closes the rose when a sheet opens', () => {
    render(<Table opened={false} />);
    act(() => setRose(true));
    act(() => setSheet(true));
    expect(screen.queryByText('rose')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
  });

  it('does not loop: the board that yields to the rose does not bring it back', () => {
    roseClosed = 0;
    render(<Table />);
    act(() => setRose(true));
    expect(roseClosed).toBe(0);
    expect(screen.getByText('rose')).toBeTruthy();
    expect(search.windows ?? []).not.toContain('personalBoard');
  });

  it('claims nothing while folded: mounted folded after a sheet is open, it closes nothing', () => {
    render(<Table opened={false} late />);
    act(() => setSheet(true));
    act(() => mountBoard(true));
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
    act(() => setRose(true));
    act(() => mountBoard(false));
    act(() => mountBoard(true));
    expect(screen.getByText('rose')).toBeTruthy();
    expect(roseClosed).toBe(0);
  });

  it('claims nothing while folded: it leaves the site and the rose to their own closing', () => {
    roseClosed = 0;
    render(<Table opened={false} />);
    act(() => setRose(true));
    act(() => setSheet(true));
    expect(roseClosed).toBe(1);
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
    expect(screen.queryByText('rose')).toBeNull();
    expect(search.building).toBe('B');
  });

  it('folds by its own onOpen(false) when it has no onYield', () => {
    render(<Table yields={false} />);
    expect(unfolded()).toBe(true);
    act(() => setRose(true));
    expect(unfolded()).toBe(false);
    expect(search.windows ?? []).not.toContain('personalBoard');
    expect(screen.getByText('rose')).toBeTruthy();
  });

  it('does not take the place back when the hand returns from the map', () => {
    class Pointer extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? '';
      }
    }
    vi.stubGlobal('PointerEvent', Pointer);
    document.elementsFromPoint = () => [];
    Element.prototype.hasPointerCapture = () => false;
    roseClosed = 0;
    render(<Table />);
    const tile = screen.getByRole('button', { name: /^Quartier général — / });
    const pointer = { pointerId: 1, pointerType: 'touch', button: 0 };
    fireEvent(
      tile,
      new Pointer('pointerdown', { ...pointer, bubbles: true, clientX: 50, clientY: 200 }),
    );
    fireEvent(window, new Pointer('pointermove', { ...pointer, clientX: 50, clientY: 20 }));
    fireEvent(window, new Pointer('pointermove', { ...pointer, clientX: 50, clientY: 10 }));
    expect(screen.getByRole('button', { name: fr.footBar.grip.open })).toBeTruthy();
    act(() => setRose(true));
    fireEvent(window, new Pointer('pointercancel', pointer));
    expect(screen.getByText('rose')).toBeTruthy();
    expect(roseClosed).toBe(0);
  });
});

describe('the yield navigation', () => {
  it('replaces the entry: Back does not come back to the board the surface folded', async () => {
    const root = createRootRoute();
    const plateau = createRoute({ getParentRoute: () => root, path: '/plateau' });
    const history = createMemoryHistory({
      initialEntries: ['/plateau', '/plateau?windows=%5B%22personalBoard%22%5D'],
    });
    const router = createRouter({ routeTree: root.addChildren([plateau]), history });
    await router.load();
    await router.navigate({ to: '/plateau', ...yieldNavigation('personalBoard') });
    expect(history.length).toBe(2);
    await router.navigate({ to: '/plateau', search: { windows: ['journal'] } });
    history.back();
    await router.load();
    expect(router.state.location.search).toEqual({});
    expect(history.length).toBe(3);
  });
});
