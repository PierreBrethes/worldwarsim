import { describe, expect, it } from 'vitest';
import { stationKeyOf } from '@/domain/troops';
import { depositHolders } from '@/domain/construction';
import { nationInk } from '@/domain/nations';
import { DEPOSIT_POINTS } from '@/domain/world';
import {
  buildingsOfMaquette,
  campsShown,
  markersOf,
  mastPointsOf,
  strategicMarkerId,
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

  it('turns a pile on a point to its heading, never an outpost garrison (#362)', () => {
    const station = { kind: 'outpost', outpostId: 'o1' } as const;
    const piles = standingPilesOf(
      meWith([{ ...troop('a', station), facing: 90 }]),
      [
        {
          kind: 'stack',
          id: 'p',
          lonLat: [1, 2],
          pieces: { groups: [], troopIds: ['b'], squad: false },
        } as never,
      ],
      new Set(),
      false,
    );
    expect(piles.map((pile) => pile.facing)).toEqual([undefined, undefined]);
    const facing = standingPilesOf(
      meWith([{ ...troop('b', { kind: 'point', lonLat: [1, 2] }), facing: 90 }]),
      [
        {
          kind: 'stack',
          id: 'p',
          lonLat: [1, 2],
          pieces: { groups: [], troopIds: ['b'], squad: false },
        } as never,
      ],
      new Set(),
      false,
    );
    expect(facing.map((pile) => pile.facing)).toEqual([90]);
  });

  it('gives a pile the heading of the first troop of the list that has one, whatever the pile’s order (#560)', () => {
    const at = { kind: 'point', lonLat: [1, 2] } as const;
    const piles = standingPilesOf(
      meWith([
        troop('a', at),
        { ...troop('c', at), facing: 270 },
        { ...troop('b', at), facing: 90 },
      ]),
      [
        {
          kind: 'stack',
          id: 'p',
          lonLat: [1, 2],
          pieces: { groups: [], troopIds: ['b', 'a', 'c'], squad: false },
        } as never,
      ],
      new Set(),
      false,
    );
    expect(piles.map((pile) => pile.facing)).toEqual([270]);
  });

  it('prefers the bearing of a contact to the heading of arrival, for a pile on a point only (#641)', () => {
    const at = { kind: 'point', lonLat: [1, 2] } as const;
    const station = { kind: 'outpost', outpostId: 'o1' } as const;
    const stack = {
      kind: 'stack',
      id: 'p',
      lonLat: [1, 2],
      pieces: { groups: [], troopIds: ['b'], squad: false },
    } as never;
    const me = meWith([{ ...troop('b', at), facing: 90 }, troop('a', station)]);
    const toward = new Map([
      ['p', 200],
      [stationKeyOf(station), 10],
    ]);
    const piles = standingPilesOf(me, [stack], new Set(), false, toward);
    expect(piles.map((pile) => pile.facing)).toEqual([200, undefined]);
    expect(standingPilesOf(me, [stack], new Set(), false).map((pile) => pile.facing)).toEqual([
      90,
      undefined,
    ]);
  });

  it('leaves a pile alone when no troop of the list is in it, or when it holds none (#560)', () => {
    const at = { kind: 'point', lonLat: [1, 2] } as const;
    const stack = (troopIds: string[]) =>
      ({
        kind: 'stack',
        id: `p${troopIds.join('')}`,
        lonLat: [1, 2],
        pieces: { groups: [], troopIds, squad: false },
      }) as never;
    const piles = standingPilesOf(
      meWith([{ ...troop('a', at), facing: 90 }]),
      [stack(['ghost']), stack([])],
      new Set(),
      false,
    );
    expect(piles.map((pile) => pile.facing)).toEqual([undefined, undefined]);
  });

  it('leaves a marching troop out of the garrison it left', () => {
    const station = { kind: 'outpost', outpostId: 'o1' } as const;
    expect(standingPilesOf(meWith([troop('a', station)]), [], new Set(['a']), false)).toEqual([]);
  });
});

describe('the pieces that rest at their post (#475)', () => {
  const at = (role: string, id: string, buildingId: string) => ({
    id,
    role,
    tier: 1,
    strength: 100,
    nominalStrength: 100,
    stationedAt: { kind: 'building', buildingId },
  });
  const me = (troops: unknown[]) =>
    ({
      buildings: [
        { id: 'a1', key: 'airfield', point: [1, 2] },
        { id: 'p1', key: 'port', point: [3, 4] },
      ],
      outposts: [],
      troops,
    }) as never;
  const posted = (piles: ReturnType<typeof standingPilesOf>) =>
    piles.flatMap((pile) => pile.pieces.groups.map((group) => [group.role, group.posted === true]));

  it('posts the planes of an airfield and the hulls of a port, not the men beside them, in a Mondiale', () => {
    const troops = [
      at('fighter', 'f', 'a1'),
      at('infantry', 'i', 'a1'),
      at('cargo', 'c', 'p1'),
      at('infantry', 'j', 'p1'),
    ];
    expect(posted(standingPilesOf(me(troops), [], new Set(), false)).sort()).toEqual(
      [
        ['fighter', true],
        ['infantry', false],
        ['cargo', true],
        ['infantry', false],
      ].sort(),
    );
  });

  it('posts nothing in a Blitz: the plane stays aloft', () => {
    expect(posted(standingPilesOf(me([at('fighter', 'f', 'a1')]), [], new Set(), true))).toEqual([
      ['fighter', false],
    ]);
  });

  it('never posts what is not my garrison: a force seen at a site stands where the view serves it', () => {
    const seen = {
      kind: 'stack',
      id: 'enemy',
      lonLat: [1, 2],
      pieces: {
        groups: [{ role: 'fighter', troops: 1, troopIds: ['x'], figures: [1], wear: 'whole' }],
        troopIds: ['x'],
        squad: false,
      },
    } as never;
    expect(posted(standingPilesOf(me([]), [seen], new Set(), false))).toEqual([['fighter', false]]);
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
      [arc('sea', ['i1'], ['sea']), arc('enemy', ['i1'], ['land'], 'enemyDetected')],
      troops,
      false,
    );
    expect(pieces.size).toBe(0);
  });
});

describe('the deposits markersOf draws', () => {
  const [standing, ordered, seen, free] = DEPOSIT_POINTS.filter(
    (point) => point.deposit === 'coal',
  );
  const view = {
    mode: 'mondiale',
    loadedAt: 0,
    me: {
      nation: 'france',
      ink: '#000',
      buildings: [{ id: 'b1', key: 'mine', point: standing!.lonLat, level: 1, regionId: 'r' }],
      construction: { key: 'mine', point: ordered!.lonLat, regionId: 'r', outpostId: null },
      constructionQueue: [],
      regions: [],
      outposts: [],
      troops: [],
    },
    surveyedInstallations: [{ id: 's1', key: 'mine', point: seen!.lonLat, regionId: 'r' }],
    surveyedOutposts: [],
    neutralSites: [],
    lootSightings: [],
    camps: [],
    objectives: [],
    strategicPoints: [],
    buildCatalog: { mine: { cost: {}, minutes: 30 } },
  } as never;
  const deposits = () =>
    markersOf(view, {
      marching: new Set(),
      regionAt: null,
      toggles: { deposits: true, buildings: false } as never,
      calls: null,
      holders: depositHolders(view),
      knownRegionById: new Map(),
    }).filter((marker) => marker.kind === 'deposit');

  it('hangs a name below the piece standing on it: my building, my works, a surveyed one (#445)', () => {
    const clears = (id: string) =>
      (deposits().find((marker) => marker.id === `deposit-${id}`) as { clears?: string }).clears;
    expect(clears(standing!.id)).toBe(`building-mine@${standing!.lonLat}`);
    expect(clears(ordered!.id)).toBe(`building-mine@${ordered!.lonLat}`);
    expect(clears(seen!.id)).toBe('installation-s1');
    expect(clears(free!.id)).toBeUndefined();
  });
});

describe('the building labels markersOf draws', () => {
  const at: [number, number] = [5.744, 46.711];
  const view = {
    mode: 'mondiale',
    loadedAt: 0,
    me: {
      nation: 'france',
      ink: '#000',
      buildings: [{ id: 'b1', key: 'warehouse', point: at, level: 1, regionId: 'r' }],
      construction: null,
      constructionQueue: [
        { id: 'q1', key: 'warehouse', point: at, level: 1, regionId: 'r', outpostId: null },
      ],
      regions: [],
      outposts: [],
      troops: [],
    },
    surveyedInstallations: [],
    surveyedOutposts: [],
    neutralSites: [],
    lootSightings: [],
    camps: [],
    objectives: [],
    strategicPoints: [],
    buildCatalog: { warehouse: { cost: {}, minutes: 30 } },
  } as never;

  it('gives a warehouse and a first-level site at its very point a label id each (#570)', () => {
    const ids = markersOf(view, {
      marching: new Set(),
      regionAt: null,
      toggles: { deposits: false, buildings: true } as never,
      calls: null,
      holders: new Map(),
      knownRegionById: new Map(),
    })
      .filter((marker) => marker.kind === 'building')
      .map((marker) => marker.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(`building-warehouse@${at}`);
  });
});

describe('campsShown (#441)', () => {
  it('drops the garrison surveyed at an objective with its layer, for the map and the contacts alike', () => {
    const view = {
      objectives: [{ point: [10, 45] }],
      camps: [
        { id: 'guard', point: [10, 45] },
        { id: 'field', point: [11, 45] },
      ],
    } as never;
    const ids = (objectives: boolean) =>
      campsShown(view, { objectives } as never).map(({ id }) => id);
    expect(ids(true)).toEqual(['guard', 'field']);
    expect(ids(false)).toEqual(['field']);
  });
});

describe('the masts of the seven points', () => {
  const point = (id: string, over: object = {}) =>
    ({
      id,
      key: 'lisbon',
      point: [-9, 38],
      holder: null,
      mine: false,
      contested: false,
      ...over,
    }) as never;

  it('stands one mast per point under the id of its marker, seen or not', () => {
    const masts = mastPointsOf(
      [point('a'), point('b', { holder: { nation: 'germany', heldMs: 0 } })],
      false,
      null,
    );
    expect(masts.map(({ id }) => id)).toEqual([strategicMarkerId('a'), strategicMarkerId('b')]);
    expect(masts[0]!.lonLat).toEqual([-9, 38]);
    expect(masts[0]!.mast.ink).not.toBe(masts[1]!.mast.ink);
  });

  it('takes the ring away once the season is concluded, and stands nothing without points', () => {
    expect(mastPointsOf([point('a', { contested: true })], false, null)[0]!.mast.ring).toBe(true);
    expect(mastPointsOf([point('a', { contested: true })], true, null)[0]!.mast.ring).toBe(false);
    expect(mastPointsOf([], false, null)).toEqual([]);
  });

  it('lights the beam of the leader holdings only, while the race runs (#678)', () => {
    const race = { leaderNation: 'germany', endsAt: 5 };
    const points = [
      point('a', { holder: { nation: 'germany', heldMs: 0 } }),
      point('b', { holder: { nation: 'britain', heldMs: 0 } }),
      point('c'),
    ];
    expect(mastPointsOf(points, false, race).map(({ beam }) => beam ?? null)).toEqual([
      nationInk('germany'),
      null,
      null,
    ]);
    expect(mastPointsOf(points, false, null).every(({ beam }) => (beam ?? null) === null)).toBe(
      true,
    );
    expect(mastPointsOf(points, true, race).every(({ beam }) => (beam ?? null) === null)).toBe(
      true,
    );
  });
});
