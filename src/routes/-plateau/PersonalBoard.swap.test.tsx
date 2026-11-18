// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOURCES } from '@/domain/ids';
import type { Building, PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { setMapMotionSetting } from '@/data/mapMotion';
import { PersonalBoard } from './PersonalBoard';

/**
 * **Le rang qui change de contenu** (#581) : tuiles → site, site → site et site → tuiles jouent
 * chacun une cascade, une seule ; le dépliage à la main ne la rejoue pas ; la cascade attend les
 * cartes du site ; « réduites » fond sans cascade, « coupées » ne bouge pas.
 */
let workshop: unknown;
const listeners = new Set<() => void>();
const client = {
  watchQuery: () => ({
    localQueryResult: () => workshop,
    onUpdate: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    journal: () => undefined,
  }),
  mutation: () => Promise.resolve(),
} as unknown as ConvexReactClient;

/** What each `animate` call touched: the ghost fading out, the site cards, the volet lines. */
let animated: Element[];
beforeEach(() => {
  workshop = {
    loadedAt: 0,
    troopsInService: 0,
    troopsQueued: 0,
    facilities: [],
    grid: [
      { role: 'infantry', unit: { costs: {}, minutes: 5 }, unitTier2: null },
      { role: 'infantry', unit: { costs: {}, minutes: 6 }, unitTier2: null },
    ],
  };
  animated = [];
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.animate = function (this: Element) {
    animated.push(this);
    return { finished: Promise.resolve() } as unknown as Animation;
  };
  setMapMotionSetting('full');
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('hover') || query.includes('pointer'),
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
const site = (id: string) =>
  ({
    id,
    key: 'barracks',
    name: 'Caserne',
    regionId: 'FR-NOR',
    point: [3, 50],
    level: 1,
  }) as unknown as Building;
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
const board = (chosen: Building | null, open = true) => (
  <ConvexProvider client={client}>
    <PersonalBoard
      view={view}
      seat={SEAT}
      open={open}
      onOpen={() => {}}
      research={false}
      onResearch={() => {}}
      front
      focused={null}
      site={chosen}
      onDeselectSite={() => {}}
      onOpenSiteSheet={() => {}}
      onHoldTile={() => {}}
      onPlaceTile={() => false}
      maquetteAt={null}
      placing={null}
    />
  </ConvexProvider>
);

const ghosts = () => animated.filter((one) => 'swapGhost' in (one as HTMLElement).dataset);
const cards = () => animated.filter((one) => one.hasAttribute('data-site-card'));
const lines = () => animated.filter((one) => one.matches('.mat-line'));

describe('the row that changes content at the desk', () => {
  it('plays one cascade on tiles to site, and none at mount', () => {
    const { rerender } = render(board(null));
    expect(animated).toHaveLength(0);
    rerender(board(site('A')));
    expect(ghosts()).toHaveLength(1);
    expect(cards()).toHaveLength(2);
    rerender(board(site('A')));
    expect(ghosts()).toHaveLength(1);
    expect(cards()).toHaveLength(2);
  });

  it('plays one on site A to site B, and one on site to tiles', () => {
    const { rerender } = render(board(site('A')));
    animated.length = 0;
    rerender(board(site('B')));
    expect(ghosts()).toHaveLength(1);
    expect(cards()).toHaveLength(2);
    animated.length = 0;
    rerender(board(null));
    expect(ghosts()).toHaveLength(1);
    expect(lines().length).toBeGreaterThan(0);
    expect(cards()).toHaveLength(0);
  });

  it('does not replay on the hand folding and unfolding the band', () => {
    const { rerender } = render(board(site('A')));
    animated.length = 0;
    rerender(board(site('A'), false));
    rerender(board(site('A'), true));
    expect(cards()).toHaveLength(0);
    expect(ghosts()).toHaveLength(0);
  });

  it('waits for the cards, and plays once when they arrive', () => {
    workshop = undefined;
    const { rerender } = render(board(null));
    rerender(board(site('A')));
    expect(cards()).toHaveLength(0);
    workshop = {
      loadedAt: 0,
      troopsInService: 0,
      troopsQueued: 0,
      facilities: [],
      grid: [{ role: 'infantry', unit: { costs: {}, minutes: 5 }, unitTier2: null }],
    };
    act(() => listeners.forEach((listener) => listener()));
    rerender(board(site('A')));
    expect(cards()).toHaveLength(1);
  });

  it('only fades the new row under reduced motion, and moves nothing when off', () => {
    setMapMotionSetting('reduced');
    const { rerender } = render(board(null));
    rerender(board(site('A')));
    expect(ghosts()).toHaveLength(0);
    expect(cards()).toHaveLength(0);
    expect(animated.length).toBeGreaterThan(0);
    animated.length = 0;
    setMapMotionSetting('off');
    rerender(board(site('B')));
    expect(animated).toHaveLength(0);
  });
});
