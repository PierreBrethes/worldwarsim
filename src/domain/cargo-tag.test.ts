import { describe, expect, it } from 'vitest';
import type { UnitRole } from './ids';
import { cargoTagsOf, carriersFor, heldBack, heldLabels, fedRiders } from './cargo-tag';

const troop = (id: string, role: UnitRole, carriedBy?: string) => ({
  id,
  role,
  tier: 1 as const,
  ...(carriedBy === undefined ? {} : { carriedBy }),
});
const ashore = { afloat: false, atAirfield: false };

describe('cargoTagsOf', () => {
  it('tags every transport with its riders, the seats each takes, and its own seats', () => {
    const pile = [
      troop('t1', 'landTransport'),
      troop('i1', 'infantry', 't1'),
      troop('i2', 'infantry', 't1'),
      troop('t2', 'landTransport'),
      troop('a1', 'armor'),
    ];
    expect(cargoTagsOf(pile, ashore)).toEqual([
      {
        carrierId: 't1',
        role: 'landTransport',
        seats: 2,
        used: 2,
        riders: [
          { id: 'i1', role: 'infantry', tier: 1, seats: 1 },
          { id: 'i2', role: 'infantry', tier: 1, seats: 1 },
        ],
        refusal: null,
        load: { ammunition: 0, oil: 0, coal: 0 },
        loadCapacity: 200,
        tour: null,
      },
      // Empty, it still has a tag: the hand reads its free seats on it (POC, `avail`).
      {
        carrierId: 't2',
        role: 'landTransport',
        seats: 2,
        used: 0,
        riders: [],
        refusal: 'NOT_ABOARD',
        load: { ammunition: 0, oil: 0, coal: 0 },
        loadCapacity: 200,
        tour: null,
      },
    ]);
  });

  it('carries the charge of each transport beside its seats (ADR 0028 §4)', () => {
    const [truck] = cargoTagsOf(
      [{ ...troop('t1', 'landTransport'), load: { ammunition: 60, oil: 20, coal: 0 } }],
      ashore,
    );
    expect(truck).toMatchObject({ load: { ammunition: 60, oil: 20 }, loadCapacity: 200 });
  });

  it('says why its tour waits (ADR 0028)', () => {
    const tour = {
      stops: [
        { kind: 'depot' as const, id: 'a' },
        { kind: 'site' as const, id: 'b' },
      ],
      recalled: false,
      skipped: [],
    };
    const [waiting] = cargoTagsOf(
      [
        {
          ...troop('t1', 'landTransport'),
          tour: { ...tour, waiting: { why: 'stock' as const, resource: 'oil' as const } },
        },
      ],
      ashore,
    );
    expect(waiting?.tour).toEqual({
      state: 'waiting',
      stops: 2,
      waiting: { why: 'stock', resource: 'oil' },
    });
    const [running] = cargoTagsOf(
      [{ ...troop('t1', 'landTransport'), tour: { ...tour, waiting: null } }],
      ashore,
    );
    expect(running?.tour).toMatchObject({ state: 'running', waiting: null });
  });

  it('counts a heavy rider by the seats it takes: a tank fills three of a hull', () => {
    const [hull] = cargoTagsOf([troop('c1', 'cargo'), troop('a1', 'armor', 'c1')], ashore);
    expect(hull?.riders[0]?.seats).toBe(3);
  });

  it('lists only the riders seated in it, a truck on board with its own passengers as one', () => {
    const pile = [
      troop('c1', 'cargo'),
      troop('t1', 'landTransport', 'c1'),
      troop('i1', 'infantry', 't1'),
    ];
    const [hull, truck] = cargoTagsOf(pile, ashore);
    expect(hull?.riders.map((rider) => rider.id)).toEqual(['t1']);
    expect(truck?.riders.map((rider) => rider.id)).toEqual(['i1']);
  });

  it('says why nobody can step off at sea, or off a plane away from an airfield', () => {
    const hull = [troop('c1', 'cargo'), troop('i1', 'infantry', 'c1')];
    expect(cargoTagsOf(hull, { afloat: true, atAirfield: false })[0]?.refusal).toBe(
      'DISEMBARK_AT_SEA',
    );
    const plane = [troop('p1', 'airTransport'), troop('i1', 'infantry', 'p1')];
    expect(cargoTagsOf(plane, ashore)[0]?.refusal).toBe('AIRFIELD_TARGET_REQUIRED');
    expect(cargoTagsOf(plane, { afloat: false, atAirfield: true })[0]?.refusal).toBeNull();
  });
});

describe('carriersFor', () => {
  it('names the transports that take what is in hand, full ones too: the tag says the seats', () => {
    const pile = [
      troop('t1', 'landTransport'),
      troop('t2', 'landTransport'),
      troop('x1', 'infantry', 't2'),
      troop('x2', 'infantry', 't2'),
      troop('a1', 'armor'),
    ];
    expect(carriersFor([troop('i1', 'infantry')], pile).map(({ id }) => id)).toEqual(['t1', 't2']);
  });

  it('leaves out what does not take them: a truck carries no tank', () => {
    expect(carriersFor([troop('a2', 'armor')], [troop('t1', 'landTransport')])).toEqual([]);
  });

  it('keeps a plane away from its airfield: the tag says why no one boards', () => {
    expect(
      carriersFor([troop('i1', 'infantry')], [troop('p1', 'airTransport')]).map(({ id }) => id),
    ).toEqual(['p1']);
  });
});

describe('heldBack (#504)', () => {
  const pile = [
    troop('h', 'cargo'),
    troop('i1', 'infantry', 'h'),
    troop('i2', 'infantry', 'h'),
    troop('a1', 'armor', 'h'),
  ];
  const [tag] = cargoTagsOf(pile, ashore);

  it('keeps the riders the sequence has not fed yet off the tag, and their seats with them', () => {
    const held = heldBack(tag!, new Set(['i2', 'a1']));
    expect(held.riders.map((rider) => rider.id)).toEqual(['i1']);
    expect(held.used).toBe(held.riders.reduce((sum, rider) => sum + rider.seats, 0));
    expect(held.used).toBeLessThan(tag!.used);
  });

  it('says nobody is aboard when every rider is held, as a view without them would', () => {
    const held = heldBack(tag!, new Set(['i1', 'i2', 'a1']));
    expect(held.riders).toEqual([]);
    expect(held.used).toBe(0);
    expect(held.refusal).toBe('NOT_ABOARD');
  });

  it('is the tag itself when nothing is held', () => {
    expect(heldBack(tag!, undefined)).toBe(tag);
    expect(heldBack(tag!, new Set(['other']))).toBe(tag);
  });
});

describe('heldLabels (#504)', () => {
  const [tag] = cargoTagsOf([troop('h', 'cargo'), troop('i1', 'infantry', 'h')], ashore);
  const labels = [{ id: 'a', cargo: [tag!] }, { id: 'b' }];

  it('holds the riders back on the label of their carrier, and leaves the others as they are', () => {
    const held = heldLabels(labels, new Map([['h', new Set(['i1'])]]));
    expect(held[0]!.cargo![0]!.riders).toEqual([]);
    expect(held[1]).toBe(labels[1]);
  });

  it('is the same list when nothing is held', () => {
    expect(heldLabels(labels, new Map())).toBe(labels);
  });
});

describe('fedRiders (#504)', () => {
  const before = new Map([['h', new Set(['a', 'b'])]]);

  it('takes the fed riders off what is held', () => {
    expect(fedRiders(before, 'h', ['a'])).toEqual(new Map([['h', new Set(['b'])]]));
  });

  it('forgets a hull once its last rider is fed', () => {
    expect(fedRiders(before, 'h', ['a', 'b']).size).toBe(0);
  });

  it('is the same map when nothing it held is fed', () => {
    expect(fedRiders(before, 'h', ['z'])).toBe(before);
    expect(fedRiders(before, 'other', ['a'])).toBe(before);
  });
});
