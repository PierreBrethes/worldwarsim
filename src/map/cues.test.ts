import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { pilePieces, type PilePieces } from '@/domain/pile-pieces';
import {
  boardsUnderTheEyes,
  aboardOf,
  chargementsOf,
  descentesOf,
  dispersionsOf,
  entreesOf,
  loadsOf,
  monteesOf,
  rankKept,
  sortiesOf,
} from './cues';
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
    // The man stands first, the truck second: the truck, and the squad that came down (#277).
    expect(descentesOf(before, now, pilesOf(now))).toEqual([{ truck: 'p/1', men: ['p/0'] }]);
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

describe('boardsUnderTheEyes (#277)', () => {
  it('lets the men of a truck board under the eyes, in a Mondiale only', () => {
    expect(boardsUnderTheEyes('landTransport', false)).toBe(true);
    expect(boardsUnderTheEyes('landTransport', true)).toBe(false);
  });

  it('keeps a ship or a plane swallowing the piece dropped on it', () => {
    expect(boardsUnderTheEyes('cargo', false)).toBe(false);
    expect(boardsUnderTheEyes('airTransport', false)).toBe(false);
  });
});

describe('monteesOf (#277)', () => {
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

  it('names the truck men just boarded, and each of them', () => {
    const before = aboardOf(view(truck, man('a'), man('b', 'truck'), man('c')));
    const now = view(truck, man('a', 'truck'), man('b', 'truck'), man('c', 'truck'));
    expect(monteesOf(before, now, pilesOf(now))).toEqual([{ truck: 'p/0', riders: ['a', 'c'] }]);
  });

  it('names nothing for a landing, a rider that stays, or a column leaving aboard', () => {
    const now = view(truck, man('a', 'truck'));
    expect(monteesOf(aboardOf(now), now, pilesOf(now))).toEqual([]);
    const down = view(truck, man('a'));
    expect(monteesOf(aboardOf(now), down, pilesOf(down))).toEqual([]);
    // Seated at its departure (`seatLoose`), the column stands in no pile.
    expect(monteesOf(aboardOf(view(truck, man('a'))), now, [])).toEqual([]);
  });
});

describe('dispersionsOf (#277)', () => {
  const troop = (id: string, role: UnitRole) => ({
    id,
    role,
    tier: 1 as const,
    strength: 10,
    nominalStrength: 10,
  });
  const at = (
    id: string,
    lonLat: readonly [number, number],
    ...troops: ReturnType<typeof troop>[]
  ) => ({ id, at: { lonLat }, pieces: pilePieces(troops) }) satisfies StandingPile;
  const squad = [troop('a', 'infantry'), troop('b', 'infantry'), troop('c', 'armor')];

  it('names the squad left, each piece set apart, the troop it carries and its place in the rank', () => {
    const before = [at('A', [2, 48], ...squad)];
    const now = [
      at('A', [2, 48], squad[0]!),
      at('B', [2.2, 48], squad[1]!),
      at('C', [2, 48.2], squad[2]!),
    ];
    expect(dispersionsOf(before, now, [[], []])).toEqual([
      {
        pileId: 'A',
        whole: false,
        moves: [
          { groupId: 'B/0', troopId: 'b', rank: 1 },
          { groupId: 'C/0', troopId: 'c', rank: 2 },
        ],
      },
    ]);
  });

  it('names nothing for a march, a first view, or an outpost founded on the spot', () => {
    const before = [at('A', [2, 48], ...squad)];
    const now = [at('A', [2, 48], squad[0]!, squad[1]!), at('B', [2.2, 48], squad[2]!)];
    const column = { state: 'mine', troopIds: ['c'] };
    expect(dispersionsOf(before, now, [[column], []])).toEqual([]);
    expect(dispersionsOf(before, now, [[], [column]])).toEqual([]);
    expect(dispersionsOf(null, now, [[], []])).toEqual([]);
    const founded = [at('outpost', [2, 48], ...squad)];
    expect(dispersionsOf(before, founded, [[], []])).toEqual([]);
  });

  it('names nothing for a piece found far off after a gap between two views: it marched there', () => {
    const before = [at('A', [2, 48], ...squad)];
    // A laptop asleep: the armour marched 200 km while no view came.
    const now = [at('A', [2, 48], squad[0]!, squad[1]!), at('B', [2, 49.8], squad[2]!)];
    expect(dispersionsOf(before, now, [[], []])).toEqual([]);
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

  it('reads the way it came on the last point of its route that is not where it stands', () => {
    const doubled = arc(
      ['t2'],
      [
        [1.5, 47.5],
        [2, 48],
        [2, 48],
      ],
    );
    expect(entreesOf([doubled], [garrison(barracks, ['t2'])])[0]?.toward).toEqual([1.5, 47.5]);
  });

  it('walks no figurine that carries troops of the garrison already: a squad drawn by role', () => {
    expect(entreesOf([column], [garrison(barracks, ['t1', 't2'])])).toEqual([]);
  });

  it('enters any building of mine on foot or on tracks, but no plane, no quay', () => {
    const hq = { beside: 'building-hq@2,48' };
    expect(entreesOf([column], [garrison(hq, ['t2'])])).toHaveLength(1);
    const hangar = garrison({ beside: 'building-airfield@2,48' }, ['t2']);
    const fighter = { ...hangar.pieces.groups[0]!, role: 'fighter' as UnitRole };
    expect(
      entreesOf([column], [{ ...hangar, pieces: { ...hangar.pieces, groups: [fighter] } }]),
    ).toEqual([]);
    expect(
      entreesOf([column], [garrison({ beside: 'building-port@2,48', quay: [2, 48] }, ['t2'])]),
    ).toEqual([]);
  });

  it('deploys a column that stood on a point, with no site (#362)', () => {
    expect(entreesOf([column], [garrison({ lonLat: [2, 48] }, ['t1'], ['t2'])])).toEqual([
      { pileId: 'g', groups: [1], at: [2, 48], toward: [1.5, 47.5] },
    ]);
  });

  it('names nothing for a garrison that stood there already, or a recruit', () => {
    expect(entreesOf([], [garrison(barracks, ['t1'], ['t2'])])).toEqual([]);
  });
});

describe("an outpost's garrison (#299)", () => {
  it('walks out of no barracks and into none: it hangs from its label, not beside a building', () => {
    const outpost: StandingPile = {
      id: 'o',
      label: 'outpost-1',
      at: { lonLat: [2, 48] },
      pieces: pilePieces([
        { id: 't2', role: 'infantry', tier: 1, strength: 10, nominalStrength: 10 },
      ]),
    };
    const column = {
      state: 'mine',
      troopIds: ['t2'],
      route: {
        points: [
          [1, 47],
          [2, 48],
        ] as Array<[number, number]>,
      },
    };
    expect(sortiesOf(new Set(), [outpost])).toEqual([]);
    expect(entreesOf([column], [outpost])).toEqual([]);
  });
});

describe('chargementsOf (#271)', () => {
  const group = (role: UnitRole, ...troopIds: string[]) => ({
    role,
    troops: troopIds.length,
    troopIds,
    figures: [1 as const],
    wear: 'whole' as const,
  });
  const at = (beside: string, ...groups: ReturnType<typeof group>[]): StandingPile => ({
    id: 'p',
    at: { beside },
    pieces: { groups, troopIds: groups.flatMap((g) => g.troopIds), squad: false },
  });
  const warehouse = 'building-warehouse@2,48';
  const loaded = (id: string, ammunition: number, role: UnitRole = 'landTransport') => ({
    id,
    role,
    load: { ammunition, oil: 0, coal: 0 },
  });

  it('names the truck whose load rose at a warehouse, a crate a hundred, two at most', () => {
    const before = loadsOf([loaded('t', 0), loaded('u', 50)]);
    const piles = [
      at(
        warehouse,
        group('infantry', 'i'),
        group('landTransport', 't'),
        group('landTransport', 'u'),
      ),
    ];
    expect(chargementsOf(before, [loaded('t', 250), loaded('u', 100)], piles)).toEqual([
      { siteId: warehouse, groupId: 'p/1', crates: 2 },
      { siteId: warehouse, groupId: 'p/2', crates: 1 },
    ]);
  });

  it('names a truck loaded at its HQ too', () => {
    const before = loadsOf([loaded('t', 0)]);
    const piles = [at('building-hq@2,48', group('landTransport', 't'))];
    expect(chargementsOf(before, [loaded('t', 30)], piles)).toEqual([
      { siteId: 'building-hq@2,48', groupId: 'p/0', crates: 1 },
    ]);
  });

  it('names nothing for a first sight, an unload, a cargo, another site or a point', () => {
    const now = [loaded('t', 100)];
    expect(chargementsOf(new Map(), now, [at(warehouse, group('landTransport', 't'))])).toEqual([]);
    expect(
      chargementsOf(loadsOf([loaded('t', 200)]), now, [at(warehouse, group('landTransport', 't'))]),
    ).toEqual([]);
    const before = loadsOf([loaded('t', 0)]);
    expect(
      chargementsOf(
        before,
        [loaded('t', 100, 'cargo')],
        [at('building-port@2,48', group('cargo', 't'))],
      ),
    ).toEqual([]);
    expect(
      chargementsOf(before, now, [at('building-barracks@2,48', group('landTransport', 't'))]),
    ).toEqual([]);
    expect(
      chargementsOf(before, now, [
        {
          id: 'p',
          at: { lonLat: [2, 48] },
          pieces: { groups: [group('landTransport', 't')], troopIds: ['t'], squad: false },
        },
      ]),
    ).toEqual([]);
  });
});
