import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { pilePieces, type PilePieces } from '@/domain/pile-pieces';
import { aboardOf, descentesOf, entreesOf, rankKept, sortiesOf } from './cues';
import type { StandingPile } from './engine';

const pile = (id: string, at: StandingPile['at'], ...troopIds: string[]): StandingPile => ({
  id,
  at,
  pieces: { groups: [], troopIds, squad: false } satisfies PilePieces,
});
const barracks = { beside: 'building-barracks@2,48' };

describe('sortiesOf', () => {
  const grouped = (...groups: string[][]): StandingPile => ({
    id: 'p',
    at: barracks,
    pieces: {
      groups: groups.map((troopIds) => ({
        role: 'infantry' as UnitRole,
        troops: troopIds.length,
        troopIds,
        figures: [1],
        wear: 'whole',
      })),
      troopIds: groups.flat(),
      squad: groups.length > 1,
    },
  });

  it('names the barracks a new troop stands at, its pile, and the groups that walk out', () => {
    expect(sortiesOf(new Set(['t1']), [grouped(['t1'], ['t2'])])).toEqual([
      { siteId: 'building-barracks@2,48', pileId: 'p', groups: [1] },
    ]);
  });

  it('walks out no group a known troop is drawn in: the squad drawn whole by role', () => {
    expect(sortiesOf(new Set(['t1']), [grouped(['t1', 't2'])])).toEqual([
      { siteId: 'building-barracks@2,48', pileId: 'p', groups: [] },
    ]);
  });

  it('names nothing for a known troop coming back from a march', () => {
    expect(sortiesOf(new Set(['t1']), [pile('p', barracks, 't1')])).toEqual([]);
  });

  it('names nothing for another building, or a pile on a point', () => {
    const fresh = new Set<string>();
    expect(sortiesOf(fresh, [pile('p', { beside: 'building-hq@2,48' }, 't1')])).toEqual([]);
    expect(sortiesOf(fresh, [pile('p', { lonLat: [2, 48] }, 't1')])).toEqual([]);
  });
});

describe('descentesOf', () => {
  const truck = { id: 'truck', role: 'landTransport' as const, tier: 1 as const };
  const man = (id: string, carriedBy?: string) => ({
    id,
    role: 'infantry' as const,
    tier: 1 as const,
    ...(carriedBy === undefined ? {} : { carriedBy }),
  });
  const full = { strength: 10, nominalStrength: 10 };
  const view = (...troops: Array<{ id: string; role: UnitRole; tier: 1; carriedBy?: string }>) =>
    troops.map((troop) => ({ ...troop, ...full }));
  const pilesOf = (troops: ReturnType<typeof view>): StandingPile[] => [
    { id: 'p', at: { lonLat: [2, 48] }, pieces: pilePieces(troops) },
  ];

  it('names the truck a troop has just stepped down from', () => {
    const before = aboardOf(view(truck, man('a', 'truck')));
    const now = view(truck, man('a'));
    expect(descentesOf(before, now, pilesOf(now))).toEqual(['p/1']); // the man stands first, the truck second
  });

  it('names nothing for a boarding, a troop that stays aboard or one that is gone', () => {
    const now = view(truck, man('a', 'truck'));
    expect(descentesOf(aboardOf(view(truck, man('a'))), now, pilesOf(now))).toEqual([]);
    expect(descentesOf(aboardOf(now), now, pilesOf(now))).toEqual([]);
    const without = view(truck);
    expect(descentesOf(aboardOf(now), without, pilesOf(without))).toEqual([]);
  });

  it('names nothing when the carrier is not a truck', () => {
    const ship = { id: 'ship', role: 'cargo' as const, tier: 1 as const };
    const now = view(ship, man('a'));
    expect(descentesOf(aboardOf(view(ship, man('a', 'ship'))), now, pilesOf(now))).toEqual([]);
  });
});

describe('rankKept', () => {
  const troop = (id: string, role: UnitRole) => ({
    id,
    role,
    tier: 1 as const,
    strength: 10,
    nominalStrength: 10,
  });
  const rank = (...troops: ReturnType<typeof troop>[]): StandingPile => ({
    id: 'p',
    at: barracks,
    pieces: pilePieces(troops),
  });
  const order = (pile: StandingPile) => pile.pieces.groups.map(({ troopIds }) => troopIds[0]);

  it('puts a newcomer at the end of the pieces of its role, never in their middle (Pierre, 28/10)', () => {
    const before = [rank(troop('a', 'infantry'), troop('c', 'infantry'), troop('x', 'armor'))];
    // The view serves the troops by their birth: an older troop entering the garrison comes first.
    const now = rank(
      troop('b', 'infantry'),
      troop('a', 'infantry'),
      troop('c', 'infantry'),
      troop('x', 'armor'),
    );
    expect(order(rankKept(before, [now])[0]!)).toEqual(['a', 'c', 'b', 'x']);
  });

  it('keeps the order by role, and a pile seen for the first time as served', () => {
    const now = rank(troop('b', 'infantry'), troop('x', 'armor'));
    expect(order(rankKept(null, [now])[0]!)).toEqual(['b', 'x']);
    expect(order(rankKept([], [now])[0]!)).toEqual(['b', 'x']);
  });
});

describe('entreesOf', () => {
  const arc = (troopIds: string[], points: Array<[number, number]>) => ({
    state: 'mine' as const,
    troopIds,
    route: { points },
  });
  const garrison = (at: StandingPile['at'], ...groups: string[][]): StandingPile => ({
    id: 'g',
    at,
    pieces: {
      groups: groups.map((troopIds) => ({
        role: 'infantry' as UnitRole,
        troops: 1,
        troopIds,
        figures: [1],
        wear: 'whole',
      })),
      troopIds: groups.flat(),
      squad: groups.length > 1,
    },
  });
  const column = arc(
    ['t2'],
    [
      [1, 47],
      [1.5, 47.5],
      [2, 48],
    ],
  );

  it('walks a column that arrived in a garrison from where it arrived, coming the way it came', () => {
    expect(entreesOf([column], [garrison(barracks, ['t1'], ['t2'])])).toEqual([
      {
        siteId: 'building-barracks@2,48',
        pileId: 'g',
        groups: [1],
        at: [2, 48],
        toward: [1.5, 47.5],
      },
    ]);
  });

  it('walks no figurine that carries troops of the garrison already: a squad drawn by role', () => {
    expect(entreesOf([column], [garrison(barracks, ['t1', 't2'])])).toEqual([]);
  });

  it('enters any building of mine, but no quay and no pile on a point', () => {
    const hq = { beside: 'building-hq@2,48' };
    expect(entreesOf([column], [garrison(hq, ['t2'])])).toHaveLength(1);
    expect(
      entreesOf([column], [garrison({ beside: 'building-port@2,48', quay: [2, 48] }, ['t2'])]),
    ).toEqual([]);
    expect(entreesOf([column], [garrison({ lonLat: [2, 48] }, ['t2'])])).toEqual([]);
  });

  it('names nothing for a garrison that stood there already, or a recruit', () => {
    expect(entreesOf([], [garrison(barracks, ['t1'], ['t2'])])).toEqual([]);
  });
});
