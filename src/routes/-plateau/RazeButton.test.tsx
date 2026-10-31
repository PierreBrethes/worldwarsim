// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { DemolitionCard } from './DemolitionCard';
import { GarrisonPanel } from './GarrisonPanel';
import { RazeContext } from './RazeButton';
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
