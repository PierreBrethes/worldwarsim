import { describe, expect, it } from 'vitest';
import {
  groundFactsAt,
  noShipFor,
  offersOf,
  type Offer,
  type OfferContext,
  type OfferTarget,
} from './offers';
import { MAX_QUEUED_BATCHES, MONDIALE_TROOP_BOUND } from '../../convex/constants';
import { RESOURCES } from './ids';
import type { Building, OutpostView, PlayerView, TroopStation, TroopView } from './player-view';
import { fr } from '../i18n/fr';

const at: TroopStation = {
  kind: 'point',
  lonLat: [10, 50],
  country: 'DEU',
  afloat: false,
  ground: 'land',
  coastal: false,
};

const troop = (id: string, role: TroopView['role'], extra: Partial<TroopView> = {}): TroopView =>
  ({ id, role, tier: 1, stationedAt: at, mending: false, ...extra }) as TroopView;

const building = (extra: Partial<Building> = {}): Building =>
  ({
    id: 'B1',
    key: 'barracks',
    name: 'caserne',
    regionId: 'FRA-1',
    point: [2, 48],
    level: 1,
    nextLevelCost: { steel: 50 },
    nextLevelMinutes: 60,
    cappedByHq: false,
    ...extra,
  }) as Building;

const outpost = (extra: Partial<OutpostView> = {}): OutpostView =>
  ({
    id: 'AP1',
    hostCountry: 'NOR',
    lonLat: [10, 60],
    regionId: 'NOR-1',
    specialty: 'general',
    changingTo: null,
    level: 2,
    standsAt: null,
    garrison: 0,
    disabledMinutesLeft: null,
    isMine: true,
    serving: false,
    besieged: false,
    nextLevelCost: { steel: 90 },
    nextLevelMinutes: 90,
    atMaxLevel: false,
    respecialtyCost: { steel: 45 },
    respecialtyMinutes: 45,
    coastal: false,
    ...extra,
  }) as OutpostView;

const viewWith = (me: Partial<PlayerView['me']> = {}, rest: Partial<PlayerView> = {}) =>
  ({
    mode: 'mondiale',
    loadedAt: 0,
    arcs: [],
    captures: [],
    outpostFoundation: { cost: { steel: 20 }, minutes: 120 },
    me: {
      nation: 'germany',
      slots: { total: 4, used: 0 },
      troops: [],
      outposts: [],
      buildings: [],
      regions: [],
      lootPoints: [],
      hqLevel: 1,
      construction: null,
      constructionQueue: [],
      research: { researched: [], running: null, queue: [] },
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 1000, ratePerHour: 0, cap: 1000 }]),
      ),
      ...me,
    },
    ...rest,
  }) as unknown as PlayerView;

const ctx: OfferContext = { now: 0, ground: null, afloat: false, atAirfield: false };

const pile = (troopIds: ReadonlyArray<string>, extra: Partial<OfferTarget> = {}): OfferTarget =>
  ({
    kind: 'force',
    id: 'pile',
    country: 'DEU',
    name: 'pile',
    headcount: troopIds.length,
    ground: 'land',
    station: at,
    regionId: 'DEU-1',
    troopIds,
    ...extra,
  }) as OfferTarget;

const only = (offers: ReadonlyArray<Offer>, key: Offer['key']) =>
  offers.filter((offer) => offer.key === key);

describe('offersOf — a pile', () => {
  it('offers founding under the thumb to infantry standing on foreign ground', () => {
    const view = viewWith({ troops: [troop('i1', 'infantry')] });
    expect(only(offersOf(pile(['i1']), view, ctx), 'found')).toEqual([
      { key: 'found', rank: 'thumb', refusal: null, loses: null, troopIds: ['i1'] },
    ]);
  });

  it('says why a tank founds nothing, in its place', () => {
    const view = viewWith({ troops: [troop('t1', 'armor')] });
    const [found] = only(offersOf(pile(['t1']), view, ctx), 'found');
    expect(found?.refusal).toBe(fr.errors.INFANTRY_ONLY({ role: 'armor' }));
  });

  it('says one founds nothing at sea', () => {
    const view = viewWith({ troops: [troop('i1', 'infantry')] });
    const [found] = only(offersOf(pile(['i1'], { ground: 'sea' }), view, ctx), 'found');
    expect(found?.refusal).toBe(fr.errors.NO_FOUNDING_AT_SEA());
  });

  it('names the region that already bears a building of mine', () => {
    const view = viewWith({
      troops: [troop('i1', 'infantry')],
      buildings: [building({ regionId: 'DEU-1' })],
      regions: [{ id: 'DEU-1', name: 'Thuringe' }],
    } as unknown as Partial<PlayerView['me']>);
    const [found] = only(offersOf(pile(['i1']), view, ctx), 'found');
    expect(found?.refusal).toBe(fr.errors.FRIENDLY_TARGET({ region: 'Thuringe' }));
  });

  it('says what is lacking instead of founding without the steel (ADR 0015)', () => {
    const poor = viewWith({
      troops: [troop('i1', 'infantry')],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 5.7, ratePerHour: 0, cap: 1000 }]),
      ) as PlayerView['me']['resources'],
    });
    const [found] = only(offersOf(pile(['i1']), poor, ctx), 'found');
    expect(found?.refusal).toBe(
      fr.errors.INSUFFICIENT_RESOURCE({ resource: 'steel', needed: 20, available: 5 }),
    );
  });

  it('has no founding for a garrison: one founds where one stands', () => {
    const station: TroopStation = { kind: 'outpost', outpostId: 'AP1' };
    const view = viewWith({ troops: [troop('i1', 'infantry', { stationedAt: station })] });
    const target: OfferTarget = { kind: 'garrison', station, troopIds: ['i1'] };
    expect(only(offersOf(target, view, ctx), 'found')).toEqual([]);
  });
});

describe('offersOf — disembarking', () => {
  const pileAboard = viewWith({
    troops: [troop('c1', 'cargo'), troop('i1', 'infantry', { carriedBy: 'c1' })],
  });

  it('offers the riders of a transport under the thumb', () => {
    expect(only(offersOf(pile(['c1', 'i1']), pileAboard, ctx), 'disembark')).toEqual([
      { key: 'disembark', rank: 'thumb', refusal: null, loses: null, troopIds: ['i1'] },
    ]);
  });

  it('offers one disembark per rider, each with its own troop', () => {
    const view = viewWith({
      troops: [
        troop('c1', 'cargo'),
        troop('i1', 'infantry', { carriedBy: 'c1' }),
        troop('i2', 'infantry', { carriedBy: 'c1' }),
      ],
    });
    expect(
      only(offersOf(pile(['c1', 'i1', 'i2']), view, ctx), 'disembark').map((offer) =>
        'troopIds' in offer ? offer.troopIds : null,
      ),
    ).toEqual([['i1'], ['i2']]);
  });

  it('refuses at sea, with the server’s sentence', () => {
    const [offer] = only(
      offersOf(pile(['c1', 'i1']), pileAboard, { ...ctx, afloat: true }),
      'disembark',
    );
    expect(offer?.refusal).toBe(fr.errors.DISEMBARK_AT_SEA());
  });

  it('says an air transport lands troops only at one of my airfields', () => {
    const view = viewWith({
      troops: [troop('a1', 'airTransport'), troop('i1', 'infantry', { carriedBy: 'a1' })],
    });
    const [offer] = only(offersOf(pile(['a1', 'i1']), view, ctx), 'disembark');
    expect(offer?.refusal).toBe(fr.errors.AIRFIELD_TARGET_REQUIRED());
    const [landed] = only(
      offersOf(pile(['a1', 'i1']), view, { ...ctx, atAirfield: true }),
      'disembark',
    );
    expect(landed?.refusal).toBeNull();
  });

  it('is absent when nobody held is aboard', () => {
    const view = viewWith({ troops: [troop('i1', 'infantry')] });
    expect(only(offersOf(pile(['i1']), view, ctx), 'disembark')).toEqual([]);
  });
});

describe('offersOf — the patrol', () => {
  const station: TroopStation = { kind: 'outpost', outpostId: 'AP1' };
  const posts = [outpost(), outpost({ id: 'AP2', lonLat: [10.5, 60] })];
  const garrison: OfferTarget = { kind: 'garrison', station, troopIds: ['i1'] };

  it('offers each drawn liaison of its outpost as a target', () => {
    const view = viewWith({
      outposts: posts,
      troops: [troop('i1', 'infantry', { stationedAt: station })],
    });
    expect(only(offersOf(garrison, view, ctx), 'patrol')).toEqual([
      {
        key: 'patrol',
        rank: 'thumb',
        refusal: null,
        loses: null,
        troopId: 'i1',
        liaison: ['AP1', 'AP2'],
      },
    ]);
  });

  it('says why when no slot is free', () => {
    const view = viewWith({
      outposts: posts,
      slots: { total: 1, used: 1 },
      troops: [troop('i1', 'infantry', { stationedAt: station })],
    });
    const [offer] = only(offersOf(garrison, view, ctx), 'patrol');
    expect(offer?.refusal).toBe(fr.errors.MOVEMENT_IN_FLIGHT({ maximum: 1 }));
  });

  it('is absent for a troop that does not patrol', () => {
    const view = viewWith({
      outposts: posts,
      troops: [troop('c1', 'cargo', { stationedAt: station })],
    });
    expect(offersOf({ ...garrison, troopIds: ['c1'] }, view, ctx)).toEqual([]);
  });

  it('offers the recall of a running patrol, and nothing once recalled', () => {
    const patrol = { ends: ['AP1', 'AP2'] as const, to: 'AP2', haltUntil: null, waiting: null };
    const running = viewWith({
      outposts: posts,
      troops: [
        troop('i1', 'infantry', { stationedAt: station, patrol: { ...patrol, recalled: false } }),
      ],
    });
    expect(only(offersOf(garrison, running, ctx), 'recall')).toEqual([
      { key: 'recall', rank: 'thumb', refusal: null, loses: null, troopId: 'i1' },
    ]);
    const recalled = viewWith({
      outposts: posts,
      troops: [
        troop('i1', 'infantry', { stationedAt: station, patrol: { ...patrol, recalled: true } }),
      ],
    });
    expect(only(offersOf(garrison, recalled, ctx), 'recall')).toEqual([]);
  });
});

describe('offersOf — disbanding', () => {
  const squad = viewWith({ troops: [troop('i1', 'infantry'), troop('i2', 'infantry')] });
  const nowhere = {
    landAt: () => true,
    hostAt: ([lon, lat]: readonly [number, number]) => (lon === 10 && lat === 50 ? 'DEU' : 'POL'),
    reached: () => true,
  };

  it('offers it second, with what the confirmation says is lost, while the ground is unknown', () => {
    expect(only(offersOf(pile(['i1']), squad, ctx), 'disband')).toEqual([
      {
        key: 'disband',
        rank: 'second',
        refusal: null,
        loses: fr.compass.disbandConsequence,
        point: [10, 50],
      },
    ]);
  });

  it('says there is no room once the ground is read', () => {
    const [offer] = only(offersOf(pile(['i1']), squad, { ...ctx, ground: nowhere }), 'disband');
    expect(offer?.refusal).toBe(fr.errors.NO_ROOM_TO_DISBAND());
  });

  it('says a squad keeps the loot it carries', () => {
    const loaded = viewWith({ ...squad.me, lootPoints: [{ lon: 10, lat: 50 }] });
    const [offer] = only(offersOf(pile(['i1']), loaded, ctx), 'disband');
    expect(offer?.refusal).toBe(fr.errors.SQUAD_CARRIES_LOOT());
  });

  it('is absent for a single piece, and in a Blitz', () => {
    const alone = viewWith({ troops: [troop('i1', 'infantry')] });
    expect(only(offersOf(pile(['i1']), alone, ctx), 'disband')).toEqual([]);
    const blitz = viewWith(squad.me, { mode: 'blitz' } as Partial<PlayerView>);
    expect(offersOf(pile(['i1']), blitz, ctx)).toEqual([]);
  });
});

const site = (extra: Partial<OfferTarget> = {}): OfferTarget =>
  ({
    kind: 'building',
    id: 'B1',
    key: 'barracks',
    level: 1,
    regionId: 'FRA-1',
    ...extra,
  }) as OfferTarget;

describe('offersOf — a building', () => {
  it('offers raising in its sheet, a missing matter being no refusal (#577)', () => {
    const view = viewWith({ buildings: [building({ nextLevelCost: { steel: 99999 } })] });
    expect(only(offersOf(site(), view, ctx), 'raise')).toEqual([
      { key: 'raise', rank: 'sheet', refusal: null, loses: null, buildingId: 'B1' },
    ]);
  });

  it('says why it does not rise', () => {
    const view = viewWith({ buildings: [building({ cappedByHq: true })] });
    const [offer] = only(offersOf(site(), view, ctx), 'raise');
    expect(offer?.refusal).toBe(fr.errors.CAPPED_BY_HQ());
  });

  it('offers razing in its sheet, with what is lost', () => {
    const view = viewWith({ buildings: [building()] });
    expect(only(offersOf(site(), view, ctx), 'demolish')).toEqual([
      {
        key: 'demolish',
        rank: 'sheet',
        refusal: null,
        loses: fr.compass.demolishConsequence,
        buildingId: 'B1',
      },
    ]);
  });

  it('refuses razing under a capture, and has no razing for the headquarters', () => {
    const besieged = viewWith({ buildings: [building()] }, {
      captures: [{ side: 'defender', target: { id: 'B1' }, stoppedAt: null }],
    } as unknown as Partial<PlayerView>);
    const [offer] = only(offersOf(site(), besieged, ctx), 'demolish');
    expect(offer?.refusal).toBe(fr.errors.DEMOLITION_UNDER_CAPTURE());
    const hq = viewWith({ buildings: [building({ key: 'hq' })] });
    expect(
      only(offersOf(site({ key: 'hq' } as Partial<OfferTarget>), hq, ctx), 'demolish'),
    ).toEqual([]);
  });

  it('is nothing for a building that is not mine, nor in a Blitz', () => {
    expect(offersOf(site(), viewWith(), ctx)).toEqual([]);
    const blitz = viewWith({ buildings: [building()] }, { mode: 'blitz' } as Partial<PlayerView>);
    expect(offersOf(site(), blitz, ctx)).toEqual([]);
  });
});

describe('offersOf — recruiting', () => {
  const workshop = {
    troopsInService: 0,
    troopsQueued: 0,
    facilities: [{ id: 'B1', queue: [] as unknown[] }],
    grid: [
      {
        role: 'infantry' as const,
        unit: { costs: { steel: 10 } },
        unitTier2: { costs: { steel: 20 } },
      },
      { role: 'cargo' as const, unit: { costs: { steel: 10 } }, unitTier2: null },
    ],
  };

  it('offers one card per role and tier the site forms, in its queue tab', () => {
    const view = viewWith({
      buildings: [building()],
      research: { researched: ['infantryMk2'], running: null, queue: [] },
    } as Partial<PlayerView['me']>);
    expect(
      only(offersOf(site({ workshop } as Partial<OfferTarget>), view, ctx), 'recruit'),
    ).toEqual([
      {
        key: 'recruit',
        rank: 'queue',
        refusal: null,
        loses: null,
        buildingId: 'B1',
        role: 'infantry',
        tier: 1,
      },
      {
        key: 'recruit',
        rank: 'queue',
        refusal: null,
        loses: null,
        buildingId: 'B1',
        role: 'infantry',
        tier: 2,
      },
    ]);
  });

  it('says the research a tier waits for, and the stock that lacks', () => {
    const view = viewWith({
      buildings: [building()],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 5, ratePerHour: 0, cap: 1000 }]),
      ),
    } as unknown as Partial<PlayerView['me']>);
    const [first, second] = only(
      offersOf(site({ workshop } as Partial<OfferTarget>), view, ctx),
      'recruit',
    );
    expect(first?.refusal).toBe(
      fr.errors.INSUFFICIENT_RESOURCE({ resource: 'steel', needed: 10, available: 5 }),
    );
    expect(second?.refusal).toBe(fr.errors.RESEARCH_REQUIRED({ card: 'infantryMk2' }));
  });

  const refusalsOf = (extra: Partial<typeof workshop>, key: Partial<Building> = {}) => {
    const view = viewWith({ buildings: [building(key)] });
    return only(
      offersOf(site({ workshop: { ...workshop, ...extra } } as Partial<OfferTarget>), view, ctx),
      'recruit',
    ).map((offer) => offer.refusal);
  };

  it('offers no card for a role this building does not form: the refusal is out of reach', () => {
    expect(refusalsOf({}, { key: 'airfield' })).toEqual([]);
  });

  it('says the army bound is reached, counting the queued troops', () => {
    const bound = fr.errors.TROOP_BOUND_REACHED();
    expect(refusalsOf({ troopsInService: MONDIALE_TROOP_BOUND })[0]).toBe(bound);
    expect(refusalsOf({ troopsInService: MONDIALE_TROOP_BOUND - 1, troopsQueued: 1 })[0]).toBe(
      bound,
    );
  });

  it('says the queue of the site is full, and only the queue of this site', () => {
    const queue = Array.from({ length: MAX_QUEUED_BATCHES }, () => ({}));
    expect(refusalsOf({ facilities: [{ id: 'B1', queue }] })[0]).toBe(fr.errors.QUEUE_FULL());
    expect(refusalsOf({ facilities: [{ id: 'B2', queue }] })[0]).toBeNull();
  });

  it('has no card before the workshop arrives', () => {
    const view = viewWith({ buildings: [building()] });
    expect(only(offersOf(site(), view, ctx), 'recruit')).toEqual([]);
  });
});

const post = (extra: Partial<OfferTarget> = {}): OfferTarget =>
  ({
    kind: 'outpost',
    id: 'AP1',
    hostCountry: 'NOR',
    name: 'Bergen',
    coastal: false,
    ...extra,
  }) as OfferTarget;

describe('offersOf — an outpost', () => {
  it('raises and changes specialty whatever the stock: the price is not a refusal (#577)', () => {
    const view = viewWith({
      outposts: [
        outpost({
          specialty: 'fort',
          nextLevelCost: { steel: 99999 },
          respecialtyCost: { steel: 99999 },
        }),
      ],
    });
    expect(
      offersOf(post(), view, ctx)
        .filter((offer) => offer.key === 'raiseOutpost' || offer.key === 'specialty')
        .map((offer) => offer.refusal),
    ).toEqual([null, null, null]);
  });

  it('raises a level-one point in three specialties, without a specialty change', () => {
    const view = viewWith({ outposts: [outpost({ level: 1 })] });
    const offers = offersOf(post(), view, ctx);
    expect(
      only(offers, 'raiseOutpost').map((offer) => offer.key === 'raiseOutpost' && offer.specialty),
    ).toEqual(['store', 'lookout', 'fort']);
    expect(only(offers, 'specialty')).toEqual([]);
  });

  it('says the ceiling of a point at its last level', () => {
    const view = viewWith({
      outposts: [outpost({ level: 3, atMaxLevel: true, specialty: 'fort' })],
    });
    const [offer] = only(offersOf(post(), view, ctx), 'raiseOutpost');
    expect(offer).toMatchObject({
      rank: 'raise',
      refusal: expect.any(String) as string,
      specialty: null,
    });
  });

  it('offers the other specialties, and says why a disabled point does not change', () => {
    const view = viewWith({ outposts: [outpost({ specialty: 'fort' })] });
    expect(
      only(offersOf(post(), view, ctx), 'specialty').map(
        (offer) => offer.key === 'specialty' && [offer.specialty, offer.refusal],
      ),
    ).toEqual([
      ['store', null],
      ['lookout', null],
    ]);
    const down = viewWith({ outposts: [outpost({ specialty: 'fort', disabledMinutesLeft: 30 })] });
    const [offer] = only(offersOf(post(), down, ctx), 'specialty');
    expect(offer?.refusal).toBe(fr.errors.OUTPOST_DISABLED());
  });

  it('has no raise for a point still rising, and keeps the dismantling', () => {
    const view = viewWith({ outposts: [outpost({ standsAt: 10, level: 1 })] });
    expect(offersOf(post(), view, ctx).map((offer) => offer.key)).toEqual(['dismantle']);
  });

  it('offers dismantling in its point tab, refused while it serves a movement', () => {
    const view = viewWith({ outposts: [outpost()] });
    expect(only(offersOf(post(), view, ctx), 'dismantle')).toEqual([
      {
        key: 'dismantle',
        rank: 'point',
        refusal: null,
        loses: fr.compass.dismantleConsequence,
        outpostId: 'AP1',
      },
    ]);
    const serving = viewWith({ outposts: [outpost({ serving: true })] });
    const [offer] = only(offersOf(post(), serving, ctx), 'dismantle');
    expect(offer?.refusal).toBe(fr.errors.OUTPOST_SERVING());
  });

  it('is nothing for a point that is not mine, nor in a Blitz', () => {
    expect(offersOf(post(), viewWith(), ctx)).toEqual([]);
    const blitz = viewWith({ outposts: [outpost()] }, { mode: 'blitz' } as Partial<PlayerView>);
    expect(offersOf(post(), blitz, ctx)).toEqual([]);
  });
});

describe('offersOf — a sighted camp, an objective, a strategic point (#588)', () => {
  const camp = (extra: Record<string, unknown> = {}) =>
    ({
      kind: 'camp',
      id: 'c',
      point: [10, 51],
      country: 'DEU',
      name: 'camp',
      ...extra,
    }) as OfferTarget;
  const objective = {
    kind: 'objective',
    id: 'o',
    point: [10, 51],
    country: 'DEU',
    name: 'o',
    tier: 'I',
  } as OfferTarget;
  const strategic = {
    kind: 'strategic',
    id: 'p',
    point: [10, 51],
    country: 'DEU',
    name: 'Tanger',
  } as OfferTarget;
  const piles = [
    { station: at, troopIds: ['inf'], place: 'Thionville' },
    {
      station: { ...at, lonLat: [12, 50] as [number, number] },
      troopIds: ['tank'],
      place: 'Metz',
    },
  ];
  const view = (rest: Partial<PlayerView> = {}) =>
    viewWith(
      {
        troops: [
          troop('inf', 'infantry'),
          troop('tank', 'armor', { stationedAt: { ...at, lonLat: [12, 50] } }),
        ],
      },
      { strategicPoints: [], objectives: [], ...rest },
    );
  const withPiles = { ...ctx, piles };

  it('offers « attack » once per pile, each refused in its own place', () => {
    const offers = only(offersOf(camp(), view(), withPiles), 'strike');
    expect(offers.map((offer) => offer.key === 'strike' && offer.pile.place)).toEqual([
      'Thionville',
      'Metz',
    ]);
    expect(offers.map((offer) => offer.refusal)).toEqual([null, null]);
  });

  it('refuses a pile of land with the server’s sentence when the camp lies at sea', () => {
    const offers = only(offersOf(camp({ ground: 'sea' }), view(), withPiles), 'strike');
    expect(offers.map((offer) => offer.refusal)).toEqual([
      fr.errors.LAND_TARGET_REQUIRED(),
      fr.errors.LAND_TARGET_REQUIRED(),
    ]);
  });

  it('says once that no pile takes to the sea when every one is refused for the land', () => {
    const offers = offersOf(camp({ ground: 'sea' }), view(), withPiles);
    expect(noShipFor(offers)).toBe(true);
    expect(noShipFor(offersOf(camp(), view(), withPiles))).toBe(false);
    expect(noShipFor([])).toBe(false);
  });

  it('says an objective needs infantry: the tank pile is refused, the infantry one is not', () => {
    const offers = only(offersOf(objective, view(), withPiles), 'strike');
    expect(offers.map((offer) => offer.refusal)).toEqual([null, fr.errors.INFANTRY_REQUIRED()]);
  });

  it('has nothing to offer from no pile at all', () => {
    expect(offersOf(camp(), view(), ctx)).toEqual([]);
    expect(offersOf(objective, view(), { ...ctx, piles: [] })).toEqual([]);
  });

  it('offers a march and a capture per pile on a neutral strategic point, nothing at the one I hold', () => {
    const offers = offersOf(strategic, view(), withPiles);
    expect(offers.map((offer) => offer.key)).toEqual(['march', 'capture', 'march', 'capture']);
    expect(offers.every((offer) => 'pile' in offer && offer.pile.troopIds.length === 1)).toBe(true);
    const mine = view({
      strategicPoints: [{ id: 'p', mine: true }],
    } as unknown as Partial<PlayerView>);
    expect(offersOf(strategic, mine, withPiles)).toEqual([]);
  });

  it('lets a pile without infantry march on a strategic point and says its capture is refused', () => {
    const offers = offersOf(strategic, view(), withPiles);
    const tank = offers.filter((offer) => 'pile' in offer && offer.pile.place === 'Metz');
    expect(tank.map((offer) => [offer.key, offer.refusal])).toEqual([
      ['march', null],
      ['capture', fr.errors.CAPTURE_NEEDS_INFANTRY()],
    ]);
  });

  it('offers nothing against an objective already emptied', () => {
    const emptied = view({
      objectives: [{ id: 'o', status: 'taken' }],
    } as unknown as Partial<PlayerView>);
    expect(offersOf(objective, emptied, withPiles)).toEqual([]);
    const standing = view({
      objectives: [{ id: 'o', status: 'standing' }],
    } as unknown as Partial<PlayerView>);
    expect(offersOf(objective, standing, withPiles)).not.toEqual([]);
  });

  it('offers a fleet afloat the coastal camp, and refuses a land column an unwalkable one', () => {
    const afloat = { ...at, afloat: true, ground: 'sea' as const };
    const fleet = viewWith({ troops: [troop('ship', 'escort', { stationedAt: afloat })] });
    const ship = [{ station: afloat, troopIds: ['ship'], place: 'Brest' }];
    const ctxShip = { ...ctx, piles: ship };
    const refusals = (target: OfferTarget, v: PlayerView, c: OfferContext) =>
      only(offersOf(target, v, c), 'strike').map((offer) => offer.refusal);
    expect(refusals(camp({ coastal: true }), fleet, ctxShip)).toEqual([null]);
    expect(refusals(camp({ coastal: false }), fleet, ctxShip)).toEqual([
      fr.errors.SEA_TARGET_REQUIRED(),
    ]);
    expect(refusals(camp({ walkable: false }), view(), withPiles)).toEqual([
      fr.errors.NO_FOOTING(),
      fr.errors.NO_FOOTING(),
    ]);
  });

  it('reads the ground under a point as the rose does: ground, shore and footing together', () => {
    const lookups = {
      groundAt: () => 'lake' as const,
      coastAt: () => true,
      walkableAt: () => false,
    };
    expect(groundFactsAt([10, 51], lookups)).toEqual({
      ground: 'lake',
      coastal: true,
      walkable: false,
    });
  });

  it('reads the Blitz as the server does: a unit, a camp, the theatre’s box (B18)', () => {
    const blitz = view({ mode: 'blitz', theatre: 'europe' } as Partial<PlayerView>);
    const alone = { ...withPiles, piles: [piles[0]!] };
    expect(only(offersOf(camp(), blitz, alone), 'strike').map((offer) => offer.refusal)).toEqual([
      null,
    ]);
    expect(
      only(offersOf(camp({ point: [100, 0] }), blitz, alone), 'strike').map(
        (offer) => offer.refusal,
      ),
    ).toEqual([fr.errors.OUTSIDE_THEATRE()]);
    expect(only(offersOf(objective, blitz, alone), 'strike').map((offer) => offer.refusal)).toEqual(
      [fr.errors.UNIT_TARGET_ONLY()],
    );
  });
});
