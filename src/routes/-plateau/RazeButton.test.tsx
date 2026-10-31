// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { DemolitionCard } from './DemolitionCard';
import { GarrisonPanel } from './GarrisonPanel';
import { RazeContext, razeOf } from './RazeButton';
import { PersonalBoard } from './PersonalBoard';
import { ResearchWindow } from './ResearchWindow';
import { SiteModal } from './SiteModal';

/**
 * **Au téléphone, raser se fait depuis la fiche du bâtiment** (#347) : le bouton nomme le
 * bâtiment qu'il rase, dit son refus avant le geste (`demolitionRefusalOf`), et ouvre la carte de
 * confirmation que la rose ouvre au bureau.
 */
const client = {
  watchQuery: () => ({
    localQueryResult: () => ({
      loadedAt: 0,
      captures: [],
      hqLevel: 1,
      maxQueue: 5,
      troopsInService: 0,
      troopsQueued: 0,
      facilities: [],
      roster: [],
      grid: [],
    }),
    onUpdate: () => () => {},
    journal: () => undefined,
  }),
  mutation: () => Promise.resolve(),
} as unknown as ConvexReactClient;

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
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
});
afterEach(cleanup);

const SEAT = { token: 't', seasonId: 's' } as unknown as Seat;
const standing = (id: string, key: string, name: string) => ({
  id,
  key,
  name,
  regionId: 'FR-NOR',
  point: [3, 50],
  level: 1,
  cappedByHq: false,
  nextLevelCost: {},
  nextLevelMinutes: 1,
});
const view = {
  loadedAt: 0,
  mode: 'mondiale',
  captures: [],
  arcs: [],
  me: {
    nation: 'france',
    defeated: false,
    troops: [],
    stationedCargo: [],
    construction: null,
    constructionQueue: [],
    recruiting: [],
    resources: {},
    regions: [{ id: 'FR-NOR', name: 'Nord', linked: true }],
    buildings: [standing('B-1', 'barracks', 'Caserne'), standing('B-2', 'hq', 'Quartier général')],
  },
} as unknown as PlayerView;

const boardView = {
  ...view,
  buildCatalog: new Proxy({}, { get: () => ({ minutes: 1, cost: {} }) }),
  boardRead: null,
  me: {
    ...view.me,
    foundation: [],
    outposts: [],
    chains: [],
    hqLevel: 1,
    upkeep: {},
    research: { researched: [], running: null, queue: [] },
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 500, ratePerHour: 0, cap: 1000 }]),
    ),
  },
} as unknown as PlayerView;

/** Le plateau en miniature : le bouton pose la carte, comme `demolish` de la rose. */
function Board({ buildingId }: { buildingId: string }) {
  const [asked, setAsked] = useState<string | null>(null);
  const razed = view.me.buildings.find((one) => one.id === asked);
  return (
    <ConvexProvider client={client}>
      <RazeContext.Provider value={(id) => setAsked(id)}>
        <SiteModal
          view={view}
          seat={SEAT}
          buildingId={buildingId}
          rank={0}
          inFront
          onBringForward={() => {}}
          onOpenGunnery={() => {}}
          onPrepare={() => {}}
          onClose={() => {}}
        />
      </RazeContext.Provider>
      {razed !== undefined && (
        <DemolitionCard
          seat={SEAT}
          view={view}
          building={razed}
          at={{ x: 0, y: 0 }}
          onRazing={() => {}}
          onRefused={() => {}}
          onClose={() => {}}
        />
      )}
    </ConvexProvider>
  );
}

const garrisonOf = (buildingId: string) => (
  <ConvexProvider client={client}>
    <RazeContext.Provider value={() => {}}>
      <GarrisonPanel
        view={view}
        seat={SEAT}
        station={{ kind: 'building', buildingId }}
        at={{ x: 10, y: 10 }}
        preselect={[]}
        onClose={() => {}}
        onPrepare={() => {}}
        onDismantle={() => {}}
      />
    </RazeContext.Provider>
  </ConvexProvider>
);

describe('the site sheet of one of my buildings, under a finger', () => {
  it('offers « raser » for that building, which opens the confirmation card', () => {
    render(<Board buildingId="B-1" />);
    expect(screen.queryByText(fr.demolition.submit)).toBeNull();
    act(() => screen.getByRole('button', { name: fr.compass.razeNamed('Caserne') }).click());
    expect(screen.getByText(fr.demolition.submit)).toBeTruthy();
  });

  it('says why the headquarters cannot be razed, before the touch', () => {
    render(garrisonOf('B-2'));
    expect(screen.queryByRole('button', { name: /raser/ })).toBeNull();
    expect(screen.getByText(fr.errors.HQ_NEVER_DEMOLISHED())).toBeTruthy();
  });

  it('offers « raser » on the garrison sheet of another building', () => {
    render(garrisonOf('B-1'));
    expect(screen.getByRole('button', { name: fr.compass.razeNamed('Caserne') })).toBeTruthy();
  });
});

/** Ce que le plateau fournit au contexte : rien en Blitz ni pour un vaincu, comme la rose. */
describe('what the board lends to the sheets', () => {
  const open = vi.fn();
  it('lends nothing in Blitz: the server answers NOT_IN_BLITZ', () => {
    expect(razeOf({ blitz: true, defeated: false }, open)).toBeNull();
  });
  it('lends nothing to a defeated player', () => {
    expect(razeOf({ blitz: false, defeated: true }, open)).toBeNull();
  });
  it('lends the order otherwise', () => {
    expect(razeOf({ blitz: false, defeated: false }, open)).toBe(open);
  });
  it('shows no button on a site sheet when nothing is lent', () => {
    render(
      <ConvexProvider client={client}>
        <RazeContext.Provider value={razeOf({ blitz: true, defeated: false }, open)}>
          <SiteModal
            view={view}
            seat={SEAT}
            buildingId="B-1"
            rank={0}
            inFront
            onBringForward={() => {}}
            onOpenGunnery={() => {}}
            onPrepare={() => {}}
            onClose={() => {}}
          />
        </RazeContext.Provider>
      </ConvexProvider>,
    );
    expect(screen.queryByRole('button', { name: /raser/ })).toBeNull();
  });
});

describe('the research window, with two centres', () => {
  const centres = {
    ...view,
    me: {
      ...view.me,
      research: { researched: [], running: null, queue: [] },
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 500, ratePerHour: 0, cap: 1000 }]),
      ),
      regions: [
        { id: 'FR-NOR', name: 'Nord', linked: true },
        { id: 'BE-1', name: 'Bruxelles', linked: true },
      ],
      buildings: [
        { ...standing('C-mine', 'researchCenter', 'Centre de recherche'), regionId: 'FR-NOR' },
        { ...standing('C-taken', 'researchCenter', 'Centre de recherche'), regionId: 'BE-1' },
      ],
    },
  } as unknown as PlayerView;
  const mount = (focused: string | undefined, onRaze = vi.fn()) => {
    render(
      <ConvexProvider client={client}>
        <RazeContext.Provider value={onRaze}>
          <ResearchWindow
            view={centres}
            seat={SEAT}
            focused={focused}
            rank={0}
            inFront
            onBringForward={() => {}}
            onClose={() => {}}
          />
        </RazeContext.Provider>
      </ConvexProvider>,
    );
    return onRaze;
  };

  it('razes the centre that was touched, and names its region', () => {
    const onRaze = mount('C-taken');
    act(() =>
      screen
        .getByRole('button', { name: fr.compass.razeNamed('Centre de recherche', 'Bruxelles') })
        .click(),
    );
    expect(onRaze).toHaveBeenCalledWith('C-taken', expect.any(Object));
  });

  it('razes none when no mast was touched', () => {
    mount(undefined);
    expect(screen.queryByRole('button', { name: /raser/ })).toBeNull();
  });
});

describe('the personal board, opened on a mast', () => {
  const mount = (focused: string | null) => {
    const onRaze = vi.fn();
    render(
      <ConvexProvider client={client}>
        <RazeContext.Provider value={onRaze}>
          <PersonalBoard
            view={boardView}
            seat={SEAT}
            open
            onOpen={() => {}}
            research={false}
            onResearch={() => {}}
            front
            focused={focused}
            site={null}
            onDeselectSite={() => {}}
            onOpenSiteSheet={() => {}}
            onHoldTile={() => {}}
            onPlaceTile={() => false}
            maquetteAt={null}
            placing={null}
          />
        </RazeContext.Provider>
      </ConvexProvider>,
    );
    return onRaze;
  };

  it('razes the building of that mast, and says which', () => {
    const onRaze = mount('B-1');
    act(() => screen.getByRole('button', { name: fr.compass.razeNamed('Caserne') }).click());
    expect(onRaze).toHaveBeenCalledWith('B-1', expect.any(Object));
  });

  it('says why the headquarters cannot be razed', () => {
    mount('B-2');
    expect(screen.getByText(fr.errors.HQ_NEVER_DEMOLISHED())).toBeTruthy();
  });

  it('offers nothing when no mast opened it', () => {
    mount(null);
    expect(screen.queryByRole('button', { name: /raser/ })).toBeNull();
  });
});
