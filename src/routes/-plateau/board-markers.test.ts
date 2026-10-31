import { describe, expect, it } from 'vitest';
import { stationKeyOf } from '@/domain/troops';
import {
  buildingsOfMaquette,
  leavingStill,
  marchingPiecesOf,
  razingStill,
  standingPilesOf,
} from './board-markers';

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

describe('marchingPiecesOf (#276)', () => {
  const troop = (id: string, role: string, carriedBy?: string) => ({
    id,
    role,
    tier: 1,
    strength: 100,
    nominalStrength: 100,
    ...(carriedBy === undefined ? {} : { carriedBy }),
  });
  const arc = (id: string, troopIds: string[], mediums = ['land'], state = 'mine') =>
    ({ id, state, troopIds, route: { legs: mediums.map((medium) => ({ medium })) } }) as never;
  const troops = [
    troop('i1', 'infantry'),
    troop('i2', 'infantry', 'truck'),
    troop('truck', 'landTransport'),
    troop('tank', 'armor'),
    troop('hull', 'cargo'),
  ] as never[];
  const roles = (pieces: { groups: ReadonlyArray<{ role: string }> } | undefined) =>
    pieces?.groups.map(({ role }) => role);

  it('lays my land movement out as its pile at rest, riders hidden, hulls and wings left out', () => {
    const pieces = marchingPiecesOf(
      [arc('m', ['i1', 'i2', 'truck', 'tank', 'hull'], ['land', 'sea'])],
      troops,
      false,
    );
    expect(roles(pieces.get('m'))).toEqual(['infantry', 'armor', 'landTransport']);
  });

  it('draws a Blitz movement in units, its truck carrying its rider', () => {
    const pieces = marchingPiecesOf([arc('m', ['i1', 'i2', 'truck'])], troops, true);
    expect(pieces.get('m')?.groups.map(({ role, aboard }) => [role, aboard ?? 0])).toEqual([
      ['infantry', 0],
      ['landTransport', 1],
    ]);
  });

  it('lays out nothing for a movement with no land leg, nor for what is not mine', () => {
    const pieces = marchingPiecesOf(
      [arc('sea', ['i1'], ['sea']), arc('enemy', [], ['land'], 'enemyDetected')],
      troops,
      false,
    );
    expect(pieces.size).toBe(0);
  });
});
