// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { SiteModal } from './SiteModal';

/**
 * **La feuille d'un entrepôt chinois** (Levée en masse, ADR 0047 §2) : un bâtiment qui n'est pas
 * un site de projection ouvre une fiche, n'y offre que l'infanterie MK1, et ne lui promet pas le
 * gain de niveau de la caserne.
 */
const NOW = Date.UTC(2026, 9, 4, 14, 0);
const sent = vi.fn();
let workshop: unknown;
const client = {
  watchQuery: () => ({
    localQueryResult: () => workshop,
    onUpdate: () => () => {},
    journal: () => undefined,
  }),
  mutation: (_reference: unknown, args: unknown) => {
    sent(args);
    return Promise.resolve({
      cost: { costs: { steel: 18, food: 10 }, minutes: 20 },
      rank: 0,
      recruitmentId: 'R-new',
    });
  },
} as unknown as ConvexReactClient;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  sent.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const SEAT = { token: 'jeton', seasonId: 'saison' } as unknown as Seat;
const priced = (steel: number, minutes: number, strength: number) => ({
  costs: { steel, food: Math.round(steel / 2) },
  minutes,
  strength,
  lockedBy: null,
});
const GRID = [
  {
    role: 'infantry',
    tiers: 2,
    producedBy: 'barracks',
    unit: priced(18, 16, 50),
    unitTier2: priced(29, 26, 30),
  },
  {
    role: 'armor',
    tiers: 2,
    producedBy: 'barracks',
    unit: priced(95, 57, 12),
    unitTier2: priced(152, 91, 6),
  },
  { role: 'cargo', tiers: 1, producedBy: 'port', unit: priced(60, 40, 12), unitTier2: null },
];
const resource = (stock: number) => ({ stock, ratePerHour: 0, cap: 1_000 });

const viewOf = (nation: string, site: { outpostId: string | null }) =>
  ({
    mode: 'mondiale',
    loadedAt: NOW,
    captures: [],
    arcs: [],
    me: {
      nation,
      defeated: false,
      troops: [],
      stationedCargo: [],
      construction: null,
      constructionQueue: [],
      resources: Object.fromEntries(RESOURCES.map((key) => [key, resource(500)])),
      regions: [{ id: 'CHN-1', name: 'Sichuan', linked: true, site }],
      buildings: [
        {
          id: 'W-1',
          key: 'warehouse',
          name: 'Entrepôt',
          regionId: 'CHN-1',
          point: [104, 30],
          level: 4,
          cappedByHq: false,
          nextLevelCost: { steel: 72 },
          nextLevelMinutes: 72,
        },
      ],
    },
  }) as unknown as PlayerView;

const mount = (view: PlayerView) =>
  render(
    <ConvexProvider client={client}>
      <SiteModal
        view={view}
        seat={SEAT}
        buildingId="W-1"
        rank={0}
        inFront
        onBringForward={() => {}}
        onOpenGunnery={() => {}}
        onPrepare={() => {}}
        onClose={() => {}}
      />
    </ConvexProvider>,
  );

const unroll = () => act(() => screen.getByRole('heading', { name: 'Entrepôt' }).click());

describe('the sheet of a Chinese warehouse on the national soil', () => {
  beforeEach(() => {
    workshop = {
      loadedAt: NOW,
      captures: [],
      hqLevel: 1,
      maxQueue: 5,
      troopsInService: 3,
      troopsQueued: 0,
      facilities: [
        { id: 'W-1', key: 'warehouse', domain: null, level: 4, regionName: 'Sichuan', queue: [] },
      ],
      roster: [],
      grid: GRID,
    };
  });

  it('offers the MK1 infantry alone: no second tier, no other role', () => {
    mount(viewOf('china', { outpostId: null }));
    unroll();
    expect(screen.getAllByRole('button', { name: /\+ 1 troupe/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'MK2' })).toBeNull();
    act(() => screen.getAllByRole('button', { name: /\+ 1 troupe/ })[0]!.click());
    expect(sent).toHaveBeenCalledWith(
      expect.objectContaining({ buildingId: 'W-1', role: 'infantry', tier: 1 }),
    );
  });

  it('never promises the barracks’ gain of level to the levied infantry', () => {
    mount(viewOf('china', { outpostId: null }));
    unroll();
    expect(screen.queryByText(fr.common.levelSpeed(4))).toBeNull();
    expect(screen.getAllByText(new RegExp(fr.production.siteLevel(4))).length).toBeGreaterThan(0);
  });

  it('opens nothing off the national soil, nor for another nation', () => {
    const abroad = mount(viewOf('china', { outpostId: 'AP-1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    abroad.unmount();
    mount(viewOf('japan', { outpostId: null }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
