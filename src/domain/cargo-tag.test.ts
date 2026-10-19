import { describe, expect, it } from 'vitest';
import type { UnitRole } from './ids';
import { cargoTagsOf, carriersFor } from './cargo-tag';

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

  it('says why its tour waits, and the full depots this round skips (ADR 0028)', () => {
    const tour = { stops: ['a', 'b'], recalled: false, skipped: 1 };
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
      skipped: 1,
    });
    const [running] = cargoTagsOf(
      [{ ...troop('t1', 'landTransport'), tour: { ...tour, waiting: null } }],
      ashore,
    );
    expect(running?.tour).toMatchObject({ state: 'running', skipped: 1 });
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
