import { describe, expect, it } from 'vitest';
import {
  depotRefundOf,
  onTourRefusalOf,
  tourRefusalOf,
  grabbedAfter,
  deliverRefusalOf,
  deliveryOf,
  dropOnSquad,
  dropRefusalOf,
  loadRefusalOf,
  takeAcross,
  missingOf,
  visitPlan,
  type SupplyLoad,
} from './logistics';

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

describe('the tour', () => {
  it('reloads what is missing from the standing order', () => {
    expect(missingOf(load(60, 40), load(10, 40))).toEqual(load(50));
  });

  it('skips a depot that cannot take what is left aboard', () => {
    const stops = [
      { id: 'a', depot: load(400), capacity: 400 },
      { id: 'b', depot: load(20), capacity: 400 },
    ];
    expect(visitPlan(load(60), stops)).toEqual({ visit: ['b'], skipped: ['a'] });
    expect(visitPlan(load(), stops)).toEqual({ visit: [], skipped: ['a', 'b'] });
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

describe('a grab of tokens', () => {
  it('takes ten, then ten by ten while held, then fifty by fifty', () => {
    expect([0, 199, 200, 800, 1000, 1200].map(grabbedAfter)).toEqual([10, 10, 20, 50, 100, 150]);
  });
});

describe('tracing a tour', () => {
  const base = {
    role: 'landTransport' as const,
    place: { kind: 'building', key: 'warehouse' } as const,
    busy: null,
    load: load(60),
    stops: ['a', 'b'],
  };

  it('leaves from a loading point, four stops at most, each once', () => {
    expect(tourRefusalOf(base)).toBeNull();
    expect(tourRefusalOf({ ...base, place: { kind: 'elsewhere' } })).toEqual({
      code: 'TOUR_NOT_AT_LOADING_POINT',
      role: 'landTransport',
    });
    expect(tourRefusalOf({ ...base, stops: ['a', 'b', 'c', 'd', 'e'] })?.code).toBe(
      'TOUR_TOO_LONG',
    );
    expect(tourRefusalOf({ ...base, stops: [] })?.code).toBe('TOUR_NO_STOP');
    expect(tourRefusalOf({ ...base, stops: ['a', 'a'] })?.code).toBe('TOUR_STOP_TWICE');
    expect(
      tourRefusalOf({ ...base, place: { kind: 'outpost', level: 1 }, baseOutpostId: 'a' })?.code,
    ).toBe('TOUR_STOP_TWICE');
  });

  it('needs a standing order to reload, and an idle transport', () => {
    expect(tourRefusalOf({ ...base, load: load() })?.code).toBe('NOTHING_TO_DELIVER');
    expect(tourRefusalOf({ ...base, busy: 'touring' })?.code).toBe('TRANSPORT_ON_TOUR');
  });

  it('takes no other order while it tours', () => {
    expect(onTourRefusalOf([{}, { tour: {} }])).toEqual({ code: 'TRANSPORT_ON_TOUR' });
    expect(onTourRefusalOf([{}])).toBeNull();
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
    expect(dropRefusalOf([plane()], depot())).toBeNull();
    expect(dropRefusalOf([plane()], depot({ depot: load(400) }))).toEqual({
      code: 'DEPOT_FULL',
      capacity: 400,
    });
    expect(dropRefusalOf([plane()], depot({ standing: false }))?.code).toBe('DEPOT_NOT_STANDING');
  });

  it('is the plane that drops, and loaded', () => {
    expect(dropRefusalOf([{ role: 'landTransport', load: load(50) }], depot())?.code).toBe(
      'DROP_BY_AIR_ONLY',
    );
    expect(dropRefusalOf([plane(load())], depot())?.code).toBe('NOTHING_TO_DELIVER');
  });

  it('drops on a lone squad, never on an anchored one nor a full one', () => {
    expect(dropRefusalOf([plane()], squad({ role: 'infantry' }))).toBeNull();
    expect(dropRefusalOf([plane()], squad({ role: 'infantry', anchored: true }))?.code).toBe(
      'SQUAD_ANCHORED',
    );
    expect(dropRefusalOf([plane()], squad())?.code).toBe('NO_SQUAD_THERE');
    // rifles use ammunition only: a packet of oil alone has nothing for them
    expect(dropRefusalOf([plane(load(0, 50))], squad({ role: 'infantry' }))?.code).toBe(
      'SQUAD_SUPPLIED',
    );
    expect(dropRefusalOf([plane()], squad({ role: 'infantry', rounds: 3 }))?.code).toBe(
      'SQUAD_SUPPLIED',
    );
  });

  it('refills rounds and fuel step by step, within what each troop lacks', () => {
    const troops = [
      { id: 'a', role: 'infantry' as const, rounds: 1 },
      { id: 'b', role: 'armor' as const, rounds: 0, fuel: 1 },
    ];
    const { taken, supplies } = dropOnSquad(load(40, 100), troops);
    // a: 2 rounds = 20 ammunition ; b: 2 rounds = 20 -> 40 ; fuel 2 steps = 20 oil
    expect(taken).toEqual(load(40, 20));
    expect(supplies.get('a')).toEqual({ rounds: 3, fuel: 0 });
    expect(supplies.get('b')).toEqual({ rounds: 2, fuel: 3 });
  });

  it('keeps the rest aboard, taking from each plane in turn', () => {
    expect(takeAcross([load(30, 5), load(30, 5)], load(40, 10))).toEqual([load(0, 0), load(20, 0)]);
  });
});
