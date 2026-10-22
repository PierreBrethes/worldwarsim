// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BUILDINGS, type BuildingKey } from '@/domain/ids';
import type { BuildSpec, PlayerView } from '@/domain/player-view';
import { destinationPoint } from '@/domain/geo';
import { DEPOSIT_POINTS } from '@/domain/world';
import { usePlacing } from './usePlacing';

vi.mock('convex/react', () => ({ useMutation: () => () => Promise.resolve() }));
vi.mock('../../../convex/_generated/api', () => ({ api: { constructions: { start: 'start' } } }));

const point = (id: string) => DEPOSIT_POINTS.find((deposit) => deposit.id === id)!.lonLat;

/** The maquette's game (#239): France, its mine on the coal of the Nord, an outpost at Namur,
 *  the Saar worked by an adversary it has surveyed. */
const view = {
  me: {
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
