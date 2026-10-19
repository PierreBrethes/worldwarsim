// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, researchRequired } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { SiteModal } from './SiteModal';

/**
 * **La feuille d'un site sur téléphone** (refonte mobile, 2a à 2c) : former, la file et la
 * garnison en onglets ; ce que le site n'ouvre pas encore descend sous « plus haut » avec sa
 * condition ; ce qui retient un rôle ouvert se dit à la place du bouton.
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
const priced = (
  steel: number,
  minutes: number,
  strength: number,
  lockedBy: string | null = null,
) => ({
  costs: { steel, food: Math.round(steel / 2) },
  minutes,
  strength,
  lockedBy,
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
    role: 'landTransport',
    tiers: 1,
    producedBy: 'barracks',
    unit: priced(40, 37, 24),
    unitTier2: null,
  },
  {
    role: 'armor',
    tiers: 2,
    producedBy: 'barracks',
    unit: priced(95, 57, 12, 'armor'),
    unitTier2: priced(152, 91, 6, 'armorMk2'),
  },
];
const workshopWith = (
  queue: ReadonlyArray<unknown>,
  { inService = 3 }: { inService?: number } = {},
) => ({
  loadedAt: NOW,
  captures: [],
  hqLevel: 1,
  maxQueue: 5,
  troopsInService: inService,
  troopsQueued: queue.length,
  facilities: [{ id: 'B-1', key: 'barracks', domain: 'land', level: 1, regionName: 'Nord', queue }],
  roster: [{ role: 'infantry', tier: 1, count: 3 }],
  grid: GRID,
});

const resource = (stock: number) => ({ stock, ratePerHour: 0, cap: 1_000 });
const view = {
  loadedAt: NOW,
  captures: [],
  arcs: [],
  me: {
    nation: 'france',
    defeated: false,
    troops: [],
    stationedCargo: [],
    construction: null,
    constructionQueue: [],
    resources: Object.fromEntries(RESOURCES.map((key) => [key, resource(500)])),
    regions: [{ id: 'FR-NOR', name: 'Nord', linked: true }],
    buildings: [
      {
        id: 'B-1',
        key: 'barracks',
        name: 'Caserne',
        regionId: 'FR-NOR',
        point: [3, 50],
        level: 1,
        cappedByHq: false,
        nextLevelCost: { steel: 72 },
        nextLevelMinutes: 72,
      },
    ],
  },
} as unknown as PlayerView;

const mount = () =>
  render(
    <ConvexProvider client={client}>
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
    </ConvexProvider>,
  );

describe('a site sheet on a phone', () => {
  it('forms what is open and sends what a card holds below, naming the card', () => {
    workshop = workshopWith([]);
    mount();

    expect(screen.getByText(fr.production.sheet.capLine(3, 0))).toBeTruthy();
    expect(screen.getByText(fr.production.sheet.lanes(1))).toBeTruthy();
    expect(screen.getByText(researchRequired('armor'))).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /\+ 1 troupe/ })).toHaveLength(2);

    act(() => screen.getByRole('button', { name: 'MK2' }).click());
    act(() => screen.getAllByRole('button', { name: /\+ 1 troupe/ })[0]!.click());
    expect(sent).toHaveBeenCalledWith(
      expect.objectContaining({ buildingId: 'B-1', role: 'infantry', tier: 2 }),
    );
  });

  it('lists the queue from the nearest to the farthest, only the waiting ones cancellable', () => {
    workshop = workshopWith([
      { id: 'R-1', role: 'infantry', tier: 1, strength: 50, started: true, minutesLeft: 12 },
      { id: 'R-2', role: 'infantry', tier: 2, strength: 30, started: false, minutesLeft: 38 },
    ]);
    mount();

    const queueTab = screen.getByRole('tab', { name: /file/ });
    expect(queueTab.textContent).toContain('2');
    act(() => queueTab.click());

    expect(screen.getByText(fr.production.sheet.running)).toBeTruthy();
    expect(screen.getByText('Infanterie MK1')).toBeTruthy();
    expect(screen.getByText(fr.production.sheet.rank(2))).toBeTruthy();
    const cancels = screen.getAllByRole('button', { name: fr.production.cancel });
    expect(cancels).toHaveLength(1);

    act(() => cancels[0]!.click());
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({ recruitmentId: 'R-2' }));
  });

  it('says what stands nowhere when the garrison is empty', () => {
    workshop = workshopWith([]);
    mount();

    act(() => screen.getByRole('tab', { name: /garnison/ }).click());
    expect(screen.getByText(fr.production.sheet.garrisonEmpty.land)).toBeTruthy();
  });
});
