import { describe, expect, it } from 'vitest';
import {
  depotRefundOf,
  onTourRefusalOf,
  tourRefusalOf,
  grabbedWithin,
  deliverRefusalOf,
  depotAccessOf,
  deliveryOf,
  airdropOnSquad,
  airdropRefusalOf,
  loadRefusalOf,
  takeAcross,
  missingOf,
  visitPlan,
  roomAboard,
  takeFromHeap,
  crawlsOn,
  type SupplyLoad,
  type TourStop,
} from './logistics';
import { emptyStocks } from './economy';

const load = (ammunition = 0, oil = 0, coal = 0): SupplyLoad => ({ ammunition, oil, coal });

describe('loading a transport', () => {
  const truckAt = (place: Parameters<typeof loadRefusalOf>[0]['place']) => ({
    role: 'landTransport' as const,
    place,
    busy: null,
    held: load(),
    resource: 'ammunition' as const,
    amount: 50,
    store: 500,
  });

  it('loads a truck at the headquarters or a warehouse, from the board', () => {
    expect(loadRefusalOf(truckAt({ kind: 'building', key: 'hq' }))).toBeNull();
    expect(loadRefusalOf(truckAt({ kind: 'building', key: 'warehouse' }))).toBeNull();
  });

  it('says where each kind loads when it stands anywhere else', () => {
    expect(loadRefusalOf(truckAt({ kind: 'building', key: 'barracks' }))).toEqual({
      code: 'LOAD_NOT_HERE',
      role: 'landTransport',
    });
    expect(loadRefusalOf({ ...truckAt({ kind: 'building', key: 'hq' }), role: 'cargo' })).toEqual({
      code: 'LOAD_NOT_HERE',
      role: 'cargo',
    });
    expect(loadRefusalOf(truckAt({ kind: 'elsewhere' }))?.code).toBe('LOAD_NOT_HERE');
  });

  it('loads at the depot of the outpost it stands at, a plane only at an air stop', () => {
    expect(loadRefusalOf(truckAt({ kind: 'outpost', level: 1 }))).toBeNull();
    const plane = { ...truckAt({ kind: 'outpost', level: 1 }), role: 'airTransport' as const };
    expect(loadRefusalOf(plane)).toEqual({ code: 'NO_AIR_STOP', level: 2 });
    expect(loadRefusalOf({ ...plane, place: { kind: 'outpost', level: 2 } })).toBeNull();
    expect(loadRefusalOf({ ...plane, place: { kind: 'building', key: 'airfield' } })).toBeNull();
  });

  it('takes neither food nor steel, and only on a transport', () => {
    expect(
      loadRefusalOf({ ...truckAt({ kind: 'building', key: 'hq' }), resource: 'food' }),
    ).toEqual({ code: 'LOAD_NOT_A_SUPPLY' });
    expect(
      loadRefusalOf({ ...truckAt({ kind: 'building', key: 'hq' }), role: 'armor' })?.code,
    ).toBe('NOT_A_TRANSPORT');
  });

  it('refuses a grab of nothing, or of no number', () => {
    const base = truckAt({ kind: 'building', key: 'hq' });
    for (const amount of [0, Number.NaN, -10, Infinity])
      expect(loadRefusalOf({ ...base, amount })).toEqual({ code: 'LOAD_AMOUNT_INVALID' });
  });

  it('refuses past the one shared capacity, and says the room left', () => {
    const full = { ...truckAt({ kind: 'building', key: 'hq' }), held: load(100, 80) };
    expect(loadRefusalOf(full)).toEqual({ code: 'LOAD_FULL', room: 20, capacity: 200 });
  });

  it('refuses what the store does not hold, a transport on the road or on a tour', () => {
    const base = truckAt({ kind: 'building', key: 'hq' });
    expect(loadRefusalOf({ ...base, store: 30 })).toEqual({
      code: 'INSUFFICIENT_RESOURCE',
      resource: 'ammunition',
      needed: 50,
      available: 30,
    });
    expect(loadRefusalOf({ ...base, busy: 'underway' })?.code).toBe('TRANSPORT_UNDERWAY');
    expect(loadRefusalOf({ ...base, busy: 'touring' })?.code).toBe('TRANSPORT_ON_TOUR');
  });
});

describe('delivering to a depot', () => {
  it('puts down what the depot has room for, and keeps the rest aboard', () => {
    expect(deliveryOf(load(150, 100), load(300), 400)).toEqual({
      moved: load(100),
      kept: load(50, 100),
    });
  });

  const outpost = { level: 1, standing: true, depot: load(), capacity: 400 };
  const truck = { role: 'landTransport' as const, load: load(50) };

  it('refuses a full depot, an empty hold, a site still building', () => {
    expect(deliverRefusalOf([truck], { ...outpost, depot: load(400) })).toEqual({
      code: 'DEPOT_FULL',
      capacity: 400,
    });
    expect(deliverRefusalOf([{ ...truck, load: load() }], outpost)?.code).toBe(
      'NOTHING_TO_DELIVER',
    );
    expect(deliverRefusalOf([truck], { ...outpost, standing: false })?.code).toBe(
      'DEPOT_NOT_STANDING',
    );
    expect(deliverRefusalOf([truck], outpost)).toBeNull();
  });

  it('has a plane land only at an air stop', () => {
    const plane = { role: 'airTransport' as const, load: load(50) };
    expect(deliverRefusalOf([plane], outpost)).toEqual({ code: 'NO_AIR_STOP', level: 2 });
    expect(deliverRefusalOf([plane], { ...outpost, level: 2, capacity: 800 })).toBeNull();
  });

  it('lets a tour pass a full depot: it skips it', () => {
    expect(deliverRefusalOf([truck], { ...outpost, depot: load(400) }, true)).toBeNull();
  });
});

describe('which depot a column may deliver to (lend-lease, ADR 0039 §3)', () => {
  const truck = { role: 'landTransport' as const, load: load(50) };
  const abroad = { mine: false, surveyed: true, asset: 'lendLease' as const, troops: [truck] };

  it('delivers to its own depot whatever the nation', () => {
    expect(depotAccessOf({ ...abroad, mine: true, asset: null })).toEqual({ kind: 'own' });
  });

  it('lets an American transport deliver to a foreign depot it has surveyed', () => {
    expect(depotAccessOf(abroad)).toEqual({ kind: 'lendLease' });
  });

  it('answers an unsurveyed foreign depot as an unknown one', () => {
    expect(depotAccessOf({ ...abroad, surveyed: false })).toEqual({
      kind: 'refused',
      refusal: { code: 'UNKNOWN_OUTPOST' },
    });
  });

  it('refuses every other nation a foreign depot', () => {
    expect(depotAccessOf({ ...abroad, asset: 'blitzkrieg' })).toEqual({
      kind: 'refused',
      refusal: { code: 'FOREIGN_DEPOT' },
    });
  });

  it('refuses a column that carries anything but transports, riders included', () => {
    const infantry = { role: 'infantry' as const };
    expect(depotAccessOf({ ...abroad, troops: [truck, infantry] })).toEqual({
      kind: 'refused',
      refusal: { code: 'LEND_LEASE_TRANSPORTS_ONLY' },
    });
  });

  it('refuses an empty hold', () => {
    expect(depotAccessOf({ ...abroad, troops: [{ ...truck, load: load() }] })).toEqual({
      kind: 'refused',
      refusal: { code: 'NOTHING_TO_DELIVER' },
    });
  });
});

describe('the tour', () => {
  it('reloads what is missing from the standing order', () => {
    expect(missingOf(load(60, 40), load(10, 40))).toEqual(load(50));
  });

  const truck = (held: SupplyLoad, harvest = emptyStocks()) => ({
    load: held,
    harvest,
    capacity: 200,
  });
  const depot = (id: string) => ({ kind: 'depot' as const, id });
  const site = (id: string) => ({ kind: 'site' as const, id });

  it('skips a depot that cannot take what is left aboard', () => {
    const stops = [
      { ...depot('a'), depot: load(400), capacity: 400 },
      { ...depot('b'), depot: load(20), capacity: 400 },
    ];
    expect(visitPlan(truck(load(60)), stops)).toEqual({
      visit: [depot('b')],
      skipped: [depot('a')],
    });
    expect(visitPlan(truck(load()), stops)).toEqual({
      visit: [],
      skipped: [depot('a'), depot('b')],
    });
  });

  it('skips a site with less than a unit heaped, or when nothing more fits aboard', () => {
    const stops = [
      { ...site('dry'), heap: 0.6 },
      { ...site('mine'), heap: 300 },
      { ...site('farm'), heap: 50 },
    ];
    expect(visitPlan(truck(load()), stops)).toEqual({
      visit: [site('mine')],
      skipped: [site('dry'), site('farm')],
    });
  });

  it('makes room at a depot for a site further on, in the order traced', () => {
    const full = truck(load(150), { ...emptyStocks(), steel: 50 });
    const pickup = { ...site('mine'), heap: 40 };
    const drop = { ...depot('a'), depot: load(), capacity: 400 };
    expect(visitPlan(full, [pickup, drop])).toEqual({
      visit: [depot('a')],
      skipped: [site('mine')],
    });
    expect(visitPlan(full, [drop, pickup])).toEqual({
      visit: [depot('a'), site('mine')],
      skipped: [],
    });
  });
});

describe('dismantling a depot', () => {
  it('gives back to the board what its bins have room for, and loses the rest', () => {
    expect(depotRefundOf(load(100, 50, 30), load(60, 400, 0))).toEqual({
      returned: load(60, 50, 0),
      lost: load(40, 0, 30),
    });
  });
});

describe('the whole bin, in whole tokens', () => {
  it('stops at what the source holds, never a fraction of a token', () => {
    expect(grabbedWithin(Infinity, 23.7)).toBe(23);
    expect(grabbedWithin(Infinity, 0)).toBe(0);
  });
});

describe('tracing a tour', () => {
  const base = {
    role: 'landTransport' as const,
    place: { kind: 'building', key: 'warehouse' } as const,
    busy: null,
    load: load(60),
    stops: [
      { kind: 'depot', id: 'a' },
      { kind: 'depot', id: 'b' },
    ] as ReadonlyArray<TourStop>,
  };
  const d = (id: string): TourStop => ({ kind: 'depot', id });
  const s = (id: string): TourStop => ({ kind: 'site', id });
  const mine = { ours: true, exploitation: true, hasQuay: false };

  it('leaves from a loading point, four stops at most, each once', () => {
    expect(tourRefusalOf(base)).toBeNull();
    expect(tourRefusalOf({ ...base, place: { kind: 'elsewhere' } })).toEqual({
      code: 'TOUR_NOT_AT_LOADING_POINT',
      role: 'landTransport',
    });
    expect(tourRefusalOf({ ...base, stops: ['a', 'b', 'c', 'd', 'e'].map(d) })?.code).toBe(
      'TOUR_TOO_LONG',
    );
    expect(tourRefusalOf({ ...base, stops: [] })?.code).toBe('TOUR_NO_STOP');
    expect(tourRefusalOf({ ...base, stops: [d('a'), d('a')] })?.code).toBe('TOUR_STOP_TWICE');
    expect(
      tourRefusalOf({ ...base, stops: [d('a'), s('a')], sites: new Map([['a', mine]]) }),
    ).toBeNull();
    expect(
      tourRefusalOf({ ...base, place: { kind: 'outpost', level: 1 }, baseOutpostId: 'a' })?.code,
    ).toBe('TOUR_STOP_TWICE');
  });

  it('needs a standing order to reload, and an idle transport', () => {
    expect(tourRefusalOf({ ...base, load: load() })?.code).toBe('NOTHING_TO_DELIVER');
    expect(tourRefusalOf({ ...base, busy: 'touring' })?.code).toBe('TRANSPORT_ON_TOUR');
  });

  it('picks up at its own exploitations, empty-handed or not', () => {
    const pickup = { ...base, load: load(), stops: [s('m')], sites: new Map([['m', mine]]) };
    expect(tourRefusalOf(pickup)).toBeNull();
    expect(tourRefusalOf({ ...pickup, stops: [s('m'), s('m')] })?.code).toBe('TOUR_STOP_TWICE');
    expect(
      tourRefusalOf({ ...pickup, sites: new Map([['m', { ...mine, ours: false }]]) })?.code,
    ).toBe('TOUR_PICKUP_NOT_OURS');
    expect(tourRefusalOf({ ...pickup, sites: new Map() })?.code).toBe('TOUR_PICKUP_NOT_OURS');
    expect(
      tourRefusalOf({ ...pickup, sites: new Map([['m', { ...mine, exploitation: false }]]) })?.code,
    ).toBe('TOUR_PICKUP_NOT_A_SITE');
  });

  it('sends a cargo only to a site whose region has a quay; a plane, anywhere', () => {
    const atSea = {
      ...base,
      role: 'cargo' as const,
      place: { kind: 'building', key: 'port' } as const,
      stops: [s('m')],
      sites: new Map([['m', mine]]),
    };
    expect(tourRefusalOf(atSea)?.code).toBe('TOUR_PICKUP_NO_QUAY');
    expect(
      tourRefusalOf({ ...atSea, sites: new Map([['m', { ...mine, hasQuay: true }]]) }),
    ).toBeNull();
    expect(
      tourRefusalOf({
        ...atSea,
        role: 'airTransport',
        place: { kind: 'building', key: 'airfield' },
      }),
    ).toBeNull();
  });

  it('takes no other order while it tours', () => {
    const truck = { role: 'landTransport' as const };
    expect(onTourRefusalOf([truck, { ...truck, tour: {} }])).toEqual({
      code: 'TRANSPORT_ON_TOUR',
    });
    expect(onTourRefusalOf([truck])).toBeNull();
  });

  it('takes no other order while it patrols, and names the troop (#376)', () => {
    expect(onTourRefusalOf([{ role: 'armor', patrol: {} }])).toEqual({
      code: 'ON_PATROL',
      role: 'armor',
    });
  });
});

describe('dropping a packet by air', () => {
  const plane = (loaded = load(60, 20)) => ({ role: 'airTransport' as const, load: loaded });
  const depot = (over = {}) => ({
    kind: 'outpost' as const,
    standing: true,
    depot: load(),
    capacity: 400,
    ...over,
  });
  const squad = (
    ...troops: Array<{ role: 'infantry' | 'armor'; anchored?: boolean; rounds?: number }>
  ) => ({
    kind: 'squad' as const,
    troops: troops.map((troop, i) => ({
      id: `t${i}`,
      anchored: false,
      rounds: 0,
      fuel: 0,
      ...troop,
    })),
  });

  it('drops on an outpost with no airstrip, until its depot is full', () => {
    expect(airdropRefusalOf([plane()], depot())).toBeNull();
    expect(airdropRefusalOf([plane()], depot({ depot: load(400) }))).toEqual({
      code: 'DEPOT_FULL',
      capacity: 400,
    });
    expect(airdropRefusalOf([plane()], depot({ standing: false }))?.code).toBe(
      'DEPOT_NOT_STANDING',
    );
  });

  it('is the plane that drops, and loaded', () => {
    expect(airdropRefusalOf([{ role: 'landTransport', load: load(50) }], depot())?.code).toBe(
      'AIRDROP_AIR_ONLY',
    );
    expect(airdropRefusalOf([plane(load())], depot())?.code).toBe('NOTHING_TO_DELIVER');
  });

  it('refuses a column that is not planes alone, loaded or not', () => {
    const empty = { role: 'landTransport' as const, load: load() };
    expect(airdropRefusalOf([plane(), empty], depot())?.code).toBe('AIRDROP_AIR_ONLY');
    expect(airdropRefusalOf([plane(), { role: 'fighter' as const }], depot())?.code).toBe(
      'AIRDROP_AIR_ONLY',
    );
    expect(airdropRefusalOf([plane(), plane()], depot())).toBeNull();
  });

  it('drops on a lone squad, never on an anchored one nor a full one', () => {
    expect(airdropRefusalOf([plane()], squad({ role: 'infantry' }))).toBeNull();
    expect(airdropRefusalOf([plane()], squad({ role: 'infantry', anchored: true }))?.code).toBe(
      'SQUAD_ANCHORED',
    );
    expect(airdropRefusalOf([plane()], squad())?.code).toBe('NO_SQUAD_THERE');
    // rifles use ammunition only: a packet of oil alone has nothing for them
    expect(airdropRefusalOf([plane(load(0, 50))], squad({ role: 'infantry' }))?.code).toBe(
      'SQUAD_SUPPLIED',
    );
    expect(airdropRefusalOf([plane()], squad({ role: 'infantry', rounds: 3 }))?.code).toBe(
      'SQUAD_SUPPLIED',
    );
  });

  it('refills rounds and fuel step by step, within what each troop lacks', () => {
    const troops = [
      { id: 'a', role: 'infantry' as const, rounds: 1 },
      { id: 'b', role: 'armor' as const, rounds: 0, fuel: 1 },
    ];
    const { taken, supplies } = airdropOnSquad(load(40, 100), troops);
    // a: 2 rounds = 20 ammunition ; b: 2 rounds = 20 -> 40 ; fuel 2 steps = 20 oil
    expect(taken).toEqual(load(40, 20));
    expect(supplies.get('a')).toEqual({ rounds: 3, fuel: 0 });
    expect(supplies.get('b')).toEqual({ rounds: 2, fuel: 3 });
  });

  it('keeps the rest aboard, taking from each plane in turn', () => {
    expect(takeAcross([load(30, 5), load(30, 5)], load(40, 10))).toEqual([load(0, 0), load(20, 0)]);
  });
});

describe('the harvest aboard (ADR 0041 §2)', () => {
  it('shares one capacity between supplies and harvest', () => {
    expect(roomAboard(200, load(50), { ...emptyStocks(), steel: 30, food: 20 })).toBe(100);
    expect(roomAboard(200, undefined, undefined)).toBe(200);
  });

  it('loads supplies only in the room the harvest leaves', () => {
    expect(
      loadRefusalOf({
        role: 'landTransport',
        place: { kind: 'building', key: 'hq' },
        busy: null,
        held: load(),
        harvest: { ...emptyStocks(), steel: 180 },
        resource: 'ammunition',
        amount: 50,
        store: 500,
      }),
    ).toEqual({ code: 'LOAD_FULL', room: 20, capacity: 200 });
  });

  it('takes whole units from a heap and leaves the fraction', () => {
    expect(takeFromHeap(40.7, 100)).toEqual({ taken: 40, left: 40.7 - 40 });
    expect(takeFromHeap(300, 120)).toEqual({ taken: 120, left: 180 });
    expect(takeFromHeap(0.9, 100)).toEqual({ taken: 0, left: 0.9 });
  });
});

describe('crawling on a dry tour (ADR 0041 §4)', () => {
  it('lets a truck or a cargo crawl on the fuel refusal alone', () => {
    expect(crawlsOn('landTransport', 'NOT_ENOUGH_FUEL')).toBe(true);
    expect(crawlsOn('cargo', 'NOT_ENOUGH_FUEL')).toBe(true);
  });

  it('keeps every other refusal a wait, and a dry plane on the ground', () => {
    expect(crawlsOn('landTransport', 'NO_LAND_ROUTE')).toBe(false);
    expect(crawlsOn('cargo', 'NO_LAND_ROUTE')).toBe(false);
    expect(crawlsOn('airTransport', 'NOT_ENOUGH_FUEL')).toBe(false);
  });
});
