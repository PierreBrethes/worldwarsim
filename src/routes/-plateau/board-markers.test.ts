import { describe, expect, it } from 'vitest';
import { stationKeyOf } from '@/domain/troops';
import { buildingsOfMaquette, leavingStill, razingStill, standingPilesOf } from './board-markers';

const mine = (id: string, point: [number, number]) => ({ id, key: 'mine' as const, point });

describe('buildingsOfMaquette', () => {
  it('names the building a maquette stands for, by its point: a tile lets go on what is drawn (#205)', () => {
    const north = mine('b1', [3.1, 50.4]);
    const east = mine('b2', [6.2, 49.1]);
    expect(buildingsOfMaquette([north, east], 'building-mine@6.2,49.1')).toEqual([east]);
  });

  it('names nothing off every piece, or on a piece that is not one of my buildings', () => {
    const north = mine('b1', [3.1, 50.4]);
    expect(buildingsOfMaquette([north], null)).toEqual([]);
    expect(buildingsOfMaquette([north], 'stack-FRA-5333')).toEqual([]);
  });
});

describe('standingPilesOf', () => {
  const troop = (id: string, stationedAt: unknown) => ({
    id,
    role: 'infantry',
    tier: 1,
    strength: 100,
    nominalStrength: 100,
    stationedAt,
  });
  const meWith = (troops: unknown[]) =>
    ({ buildings: [], outposts: [{ id: 'o1' }], troops }) as never;

  it('draws an outpost garrison at the outpost point, raised or still under works (#296)', () => {
    const station = { kind: 'outpost', outpostId: 'o1' } as const;
    const piles = standingPilesOf(
      meWith([troop('a', station), troop('b', { kind: 'point', lonLat: [1, 2] })]),
      [],
      new Set(),
      false,
    );
    expect(piles.map((pile) => [pile.id, pile.pieces.troopIds, pile.label])).toEqual([
      [stationKeyOf(station), ['a'], 'outpost-o1'],
    ]);
  });

  it('leaves a marching troop out of the garrison it left', () => {
    const station = { kind: 'outpost', outpostId: 'o1' } as const;
    expect(standingPilesOf(meWith([troop('a', station)]), [], new Set(['a']), false)).toEqual([]);
  });
});

describe('razingStill', () => {
  const barracks = { key: 'barracks', point: [2, 48] as const };
  const farm = { key: 'farm', point: [3, 47] as const };
  const razed = 'building-barracks@2,48';

  it('keeps a razed maquette listed while its building is served, the same list when nothing went', () => {
    const razing = [razed];
    expect(razingStill(razing, [barracks, farm])).toBe(razing);
  });

  it('forgets it once the view has lost it: the map has played its fall', () => {
    expect(razingStill([razed], [farm])).toEqual([]);
  });
});

describe('leavingStill', () => {
  const leaving = [{ id: 'o1', area: true }];

  it('keeps a confirmed dismantling while its point is served, the same list when nothing went (#340)', () => {
    expect(leavingStill(leaving, [{ id: 'o1' }, { id: 'o2' }])).toBe(leaving);
  });

  it('forgets it once the view has lost the point: the map has played its fall', () => {
    expect(leavingStill(leaving, [{ id: 'o2' }])).toEqual([]);
  });
});
