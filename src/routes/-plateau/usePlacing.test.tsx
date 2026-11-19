// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSpots } from '@/shell/flights';
import { BUILDINGS, RESOURCES, type BuildingKey } from '@/domain/ids';
import type { BuildSpec, PlayerView } from '@/domain/player-view';
import { destinationPoint } from '@/domain/geo';
import { DEPOSIT_POINTS } from '@/domain/world';
import { usePlacing } from './usePlacing';

const start = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('convex/react', () => ({ useMutation: () => start }));
vi.mock('../../../convex/_generated/api', () => ({ api: { constructions: { start: 'start' } } }));

const point = (id: string) => DEPOSIT_POINTS.find((deposit) => deposit.id === id)!.lonLat;

/** The maquette's game (#239): France, its mine on the coal of the Nord, an outpost at Namur,
 *  the Saar worked by an adversary it has surveyed. */
const view = {
  loadedAt: 0,
  me: {
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 100, ratePerHour: 0, cap: 1000 }]),
    ),
    nation: 'france',
    hqLevel: 1,
    foundation: [],
    construction: null,
    constructionQueue: [],
    buildings: [{ key: 'mine', point: point('coal-FRA-5334'), level: 2 }],
    outposts: [{ id: 'o', lonLat: [4.87, 50.47], level: 1, standsAt: null }],
    regions: [],
  },
  surveyedInstallations: [
    { id: 's', key: 'mine', regionId: 'DEU-1581', point: point('coal-DEU-1581') },
  ],
  buildCatalog: Object.fromEntries(
    BUILDINGS.map((key) => [key, { cost: { steel: 30 }, minutes: 30, lockedBy: null }]),
  ) as Record<BuildingKey, BuildSpec>,
} as unknown as PlayerView;

const holding = (key: BuildingKey, seen: PlayerView = view) => {
  const hook = renderHook(() =>
    usePlacing(seen, { token: 't', seasonId: 's' } as never, 'full', () => {}),
  );
  act(() => hook.result.current.hold({ key, debt: null, title: key }));
  return hook;
};

describe('a deposit key in hand (#239)', () => {
  it('wakes every free deposit of its kinds, and attracts only those the pose would take', () => {
    const { result } = holding('mine');
    const magnet = result.current.placingCard?.magnet;
    expect(magnet?.kind).toBe('deposits');
    const calls = magnet?.kind === 'deposits' ? magnet.calls : [];
    const open = (id: string) => calls.find((call) => call.deposit.id === id)?.refusal === null;
    expect(open('coal-BEL-2')).toBe(true);
    expect(calls.some((call) => call.deposit.id === 'coal-DEU-1572')).toBe(true);
    expect(open('coal-DEU-1572')).toBe(false);
    expect(calls.some((call) => call.deposit.id === 'coal-DEU-1581')).toBe(false);
  });

  it('names the nearest free deposit on the card when none is within reach', () => {
    const { result } = holding('oilWell');
    act(() =>
      result.current.setPlacingAim({
        lonLat: [5.9, 49.6],
        region: { id: 'LUX-1', name: 'Luxembourg', country: 'LUX' },
        coastal: false,
        onLand: true,
      }),
    );
    expect(result.current.placingCard?.nearest).toMatch(
      /^aucun gisement de pétrole libre à votre portée — le plus proche : Roumanie, 1[56]\d0 km$/,
    );
  });

  it('says the true reason when the nearest free deposit is refused for something else than reach', () => {
    const ploiesti = point('oil-ROU-310');
    const crowded = {
      ...view,
      me: {
        ...view.me,
        outposts: [{ id: 'r', lonLat: ploiesti, level: 1, standsAt: null }],
        buildings: [{ key: 'barracks', point: destinationPoint(ploiesti, 5, 0), level: 1 }],
      },
    } as unknown as PlayerView;
    const { result } = holding('oilWell', crowded);
    act(() =>
      result.current.setPlacingAim({
        lonLat: [5.9, 49.6],
        region: { id: 'LUX-1', name: 'Luxembourg', country: 'LUX' },
        coastal: false,
        onLand: true,
      }),
    );
    expect(result.current.placingCard?.nearest).toMatch(
      /^aucun gisement de pétrole ne se prend — le plus proche : Roumanie, \d+ km, trop près de la caserne$/,
    );
  });
});

describe('the bill on the ghost (#577)', () => {
  const poor = {
    ...view,
    me: {
      ...view.me,
      resources: { ...view.me.resources, steel: { stock: 10, ratePerHour: 0, cap: 1000 } },
    },
  } as unknown as PlayerView;

  it('says nothing before the first aim: the pose may be a free foundation', () => {
    const free = {
      ...poor,
      me: { ...poor.me, foundation: [{ key: 'mine' }] },
    } as unknown as PlayerView;
    const { result } = holding('mine', free);
    expect(result.current.placingCard?.shortage).toBeNull();
  });

  it('says what the stock lacks, and does not refuse the point', () => {
    const { result } = holding('mine', poor);
    act(() =>
      result.current.setPlacingAim({
        lonLat: point('coal-BEL-2'),
        region: { id: 'BEL-1', name: 'Namur', country: 'BEL' },
        coastal: false,
        onLand: true,
      }),
    );
    expect(result.current.placingCard?.shortage).toMatch(/^il manque 20 acier/);
    expect(result.current.placingCard?.refusal).toBeNull();
  });

  it('says nothing when the stock covers the bill', () => {
    const { result } = holding('mine');
    expect(result.current.placingCard?.shortage).toBeNull();
  });
});

describe('a unique key aimed at its standing twin (#579)', () => {
  const PARIS = [2.35, 48.85] as const;
  const standing = {
    ...view,
    me: {
      ...view.me,
      buildings: [
        ...view.me.buildings,
        {
          id: 'hq-1',
          key: 'hq',
          name: 'Quartier général',
          regionId: 'FRA-75',
          point: PARIS,
          level: 1,
          nextLevelCost: { steel: 10 },
          nextLevelMinutes: 20,
          cappedByHq: false,
        },
      ],
    },
  } as unknown as PlayerView;
  const aimAt = (lonLat: readonly [number, number]) => ({
    lonLat: [...lonLat] as [number, number],
    region: { id: 'FRA-75', name: 'Paris', country: 'FRA' },
    coastal: false,
    onLand: true,
  });

  it('raises it on a click at its point, by the very mutation the drop uses', () => {
    start.mockClear();
    const { result } = holding('hq', standing);
    act(() => result.current.placeAt(aimAt(PARIS)));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        building: 'hq',
        regionId: 'FRA-75',
        point: { lon: 2.35, lat: 48.85 },
      }),
    );
  });

  it('says the raise, not the refusal, on the ghost over its twin', () => {
    const { result } = holding('hq', standing);
    act(() => result.current.setPlacingAim(aimAt(PARIS)));
    expect(result.current.placingCard?.refusal).toBeNull();
    expect(result.current.placingCard?.name).toMatch(/^Élever .* au niveau 2$/);
  });

  it('keeps the unique refusal, and orders nothing, anywhere else', () => {
    start.mockClear();
    const { result } = holding('hq', standing);
    const far = aimAt([5.4, 43.3]);
    act(() => result.current.setPlacingAim(far));
    act(() => result.current.placeAt(far));
    expect(start).not.toHaveBeenCalled();
    expect(result.current.placingCard?.refusal).toMatch(/unique — visez-le/);
  });
});

describe('the pose played at the server answer (#592)', () => {
  const aim = {
    lonLat: point('coal-BEL-2'),
    region: { id: 'BEL-1', name: 'Namur', country: 'BEL' },
    coastal: false,
    onLand: true,
  };
  const originalAnimate = HTMLElement.prototype.animate;
  let unbind = () => {};
  beforeEach(() => {
    HTMLElement.prototype.animate = (() => ({ finished: new Promise(() => {}) })) as never;
    unbind = bindSpots({
      bin: () => ({ x: 10, y: 10 }),
      onMap: () => ({ x: 200, y: 100 }),
      queue: () => ({ x: 20, y: 800 }),
      tile: () => ({ width: 60, height: 50 }),
    });
    start.mockImplementation(() => Promise.resolve());
  });
  afterEach(() => {
    unbind();
    HTMLElement.prototype.animate = originalAnimate;
    document.body.replaceChildren();
  });
  const placeOn = async (seen: PlayerView, key: BuildingKey, at = aim) => {
    const { result } = holding(key, seen);
    await act(async () => result.current.placeAt(at));
  };
  const seen = (selector: string) => document.querySelector(selector) !== null;

  it('rings the point, flies the tile and the price once the server accepts', async () => {
    await placeOn(view, 'mine');
    expect(seen('.recharge-pulse')).toBe(true);
    expect(seen('.placed-tile')).toBe(true);
    expect(seen('.harvest-pastille')).toBe(true);
  });

  it('keeps the ring and the tile of a free foundation, and skips its price', async () => {
    const owed = {
      ...view,
      me: { ...view.me, foundation: [{ key: 'mine', deposit: null }] },
    } as unknown as PlayerView;
    await placeOn(owed, 'mine');
    expect(seen('.recharge-pulse')).toBe(true);
    expect(seen('.placed-tile')).toBe(true);
    expect(seen('.harvest-pastille')).toBe(false);
  });

  it('plays for a raise on the standing twin too', async () => {
    const standing = {
      ...view,
      me: {
        ...view.me,
        buildings: [
          ...view.me.buildings,
          {
            id: 'hq-1',
            key: 'hq',
            name: 'QG',
            regionId: 'FRA-75',
            point: [2.35, 48.85],
            level: 1,
            nextLevelCost: { steel: 10 },
            nextLevelMinutes: 20,
            cappedByHq: false,
          },
        ],
      },
    } as unknown as PlayerView;
    await placeOn(standing, 'hq', {
      ...aim,
      lonLat: [2.35, 48.85],
      region: { id: 'FRA-75', name: 'Paris', country: 'FRA' },
    });
    expect(seen('.recharge-pulse')).toBe(true);
  });

  it('plays nothing when the server refuses', async () => {
    start.mockImplementation(() => Promise.reject(new Error('refused')));
    await placeOn(view, 'mine');
    expect(seen('.recharge-pulse')).toBe(false);
    expect(seen('.placed-tile')).toBe(false);
  });

  it('plays no ring in Blitz: there is no board to file the tile on', async () => {
    await placeOn({ ...view, mode: 'blitz' } as unknown as PlayerView, 'mine');
    expect(seen('.recharge-pulse')).toBe(false);
    expect(seen('.placed-tile')).toBe(false);
  });
});
