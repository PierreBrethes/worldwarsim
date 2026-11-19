// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { BottomSheet } from '@/shell/BottomSheet';
import { SoleSurfaceProvider, useSoleSurface } from '@/shell/sole-surface';
import { PersonalBoard } from './PersonalBoard';
import { type BoardSearch, withWindow, withoutWindow, yieldWindow } from './board-search';

/**
 * **Au téléphone, une seule surface à la fois** (#596) : le plateau déplié réclame la place comme
 * la feuille ; le replié ne ferme rien ; le plateau cédé garde le site sélectionné. La rose de
 * `WorldMap` réclame par la même ligne (`useSoleSurface(closeRose, rose !== null)`) : ici
 * `Rose` la rejoue, la carte ne se montant pas sous jsdom.
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
  useSoleSurface(onClose, at);
  return at ? <p>rose</p> : null;
}

let search: BoardSearch = {};
let setRose: (open: boolean) => void = () => {};
let setSheet: (open: boolean) => void = () => {};
let setResearch: (open: boolean) => void = () => {};
let roseClosed = 0;

/** Le plateau câblé comme `plateau.tsx` : l'adresse est `search`, `onYield` la garde du site. */
function Table({ opened = true }: { opened?: boolean }) {
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
        <PersonalBoard
          view={view}
          seat={SEAT}
          open={windows.includes('personalBoard')}
          onOpen={(open) =>
            setState((was) =>
              open ? withWindow(was, 'personalBoard') : withoutWindow(was, 'personalBoard'),
            )
          }
          onYield={() => setState((was) => yieldWindow(was, 'personalBoard'))}
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

  it('claims nothing while folded: it leaves the site and the rose to their own closing', () => {
    render(<Table opened={false} />);
    act(() => setRose(true));
    act(() => setSheet(true));
    expect(roseClosed).toBe(1);
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
    expect(screen.queryByText('rose')).toBeNull();
    expect(search.building).toBe('B');
  });
});
