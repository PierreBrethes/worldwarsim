import { describe, expect, it } from 'vitest';
import type { UnitRole } from './ids';
import { cargoTagsOf } from './cargo-tag';

const troop = (id: string, role: UnitRole, carriedBy?: string) => ({
  id,
  role,
  tier: 1 as const,
  ...(carriedBy === undefined ? {} : { carriedBy }),
});
const ashore = { afloat: false, atAirfield: false };

describe('cargoTagsOf', () => {
  it('tags each loaded transport with its riders and its seats, an empty one not at all', () => {
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
          { id: 'i1', role: 'infantry', tier: 1 },
          { id: 'i2', role: 'infantry', tier: 1 },
        ],
        refusal: null,
      },
    ]);
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
