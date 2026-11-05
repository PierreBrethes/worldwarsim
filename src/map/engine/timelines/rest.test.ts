import { describe, expect, it } from 'vitest';
import { AIRFIELD, MOLE } from '@/emblems/kits/manifest';
import type { AirRole } from './airfield';
import { berthOf, type SeaRole } from './port';
import { apron, berths, layout, type Place, type Plane, settle } from './rest';

const [right, left] = AIRFIELD.lanes;
const rail = AIRFIELD.facade + 2;
const fighters = (n: number): AirRole[] => Array(n).fill('fighter');

describe('the apron: where planes rest before their hangars (#475)', () => {
  it('stands the first fighter in the right lane, its tail 2 m from the rail, nose to the runway', () => {
    const [first] = apron(['fighter']);
    expect(first).toEqual({ x: right, z: rail + 5.5, yaw: 0 });
  });

  it('steps the next one back by a pitch of 13 m, and fills the right lane before the left', () => {
    const slots = apron(fighters(4));
    expect(slots.map((s) => s!.x)).toEqual([right, right, left, left]);
    expect(slots[1]!.z - slots[0]!.z).toBeCloseTo(13, 9);
    expect(slots[3]!.z).toBeCloseTo(slots[1]!.z, 9);
  });

  it('keeps a fifth fighter at its label: the apron holds four', () => {
    expect(apron(fighters(5))[4]).toBeNull();
  });

  it('keeps a big plane alone in its lane', () => {
    const slots = apron(['bomber', 'fighter', 'fighter', 'fighter']);
    expect(slots.map((s) => s?.x)).toEqual([right, left, left, undefined]);
    expect(apron(['bomber', 'airTransport', 'bomber'])[2]).toBeNull();
    expect(apron(['fighter', 'bomber', 'fighter']).map((s) => s?.x)).toEqual([right, left, right]);
  });

  it('gives a slot by rank: when the first leaves, the next stands where it stood', () => {
    const [a, b] = apron(fighters(2));
    expect(apron(fighters(1))[0]).toEqual(a);
    expect(b).not.toEqual(a);
  });

  it('never lets the growth push the last plane of a lane past the ramp', () => {
    const [a, b] = apron(fighters(2), 1, 1.5);
    expect(b!.z + 11 / 2).toBeLessThanOrEqual(AIRFIELD.ramp.from + 1e-9);
    expect(b!.z).toBeGreaterThan(a!.z);
  });

  it('widens each step by the growth of the plane that takes it', () => {
    const [a, b] = apron(fighters(2), 1, [1, 1.2]);
    expect(b!.z - a!.z).toBeCloseTo(1.2 * 18.5 - 5.5, 9);
  });

  it('follows the growth the figurines are drawn at: the pitch widens, the rail stays', () => {
    const [a, b] = apron(fighters(2), 1, 1.2);
    expect(b!.z - a!.z).toBeCloseTo(1.2 * 13, 9);
    expect(a!.z - AIRFIELD.facade).toBeCloseTo(2 + 1.2 * 5.5, 9);
  });

  it('mirrors on the other side of the site', () => {
    const [a, b] = [apron(fighters(3)), apron(fighters(3), -1)];
    b.forEach((slot, k) => {
      expect(slot!.x).toBeCloseTo(-a[k]!.x, 9);
      expect(slot!.z).toBeCloseTo(a[k]!.z, 9);
      expect(Math.cos(slot!.yaw)).toBeCloseTo(1, 9);
    });
  });
});

const hulls = (...roles: SeaRole[]) => roles;
/** The hull's beam, a share of its length (`HULL_BEAM_SHARE`). */
const beamOf = (length: number) => 0.14 * length;

/** A held plane: its place is kept while it stays. */
const held = (...places: Array<[Place['lane'], number, AirRole?]>): Plane[] =>
  places.map(([lane, rank, role = 'fighter']) => ({ role, place: { lane, rank } }));

describe('the places of an apron, one state per plane (#475, décision du 05/11)', () => {
  it('sends a plane formed at its hangar to the most advanced free place, not crossing a parked plane', () => {
    expect(settle([], 'fighter', 'formed')).toEqual({ lane: 0, rank: 1 });
    // The right lane has a plane at its rail: the formed plane takes the neighbouring lane's front.
    expect(settle(held([0, 0]), 'fighter', 'formed')).toEqual({ lane: 1, rank: 1 });
    // A plane at the front of the right lane blocks nothing behind it for a plane coming from the hangar.
    expect(settle(held([0, 1], [1, 0]), 'fighter', 'formed')).toEqual({ lane: 0, rank: 0 });
  });

  it('sends a plane come home from the runway to the deepest free place, not crossing a parked plane', () => {
    expect(settle([], 'fighter', 'returned')).toEqual({ lane: 0, rank: 0 });
    expect(settle(held([0, 0]), 'fighter', 'returned')).toEqual({ lane: 1, rank: 0 });
    expect(settle(held([0, 0], [1, 0]), 'fighter', 'returned')).toEqual({ lane: 0, rank: 1 });
  });

  it('follows the order of the role when there is no history', () => {
    expect(settle(held([0, 0]), 'fighter', 'initial')).toEqual({ lane: 0, rank: 1 });
    expect(settle(held([0, 0], [0, 1]), 'fighter', 'initial')).toEqual({ lane: 1, rank: 0 });
    expect(settle(held([0, 0], [0, 1], [1, 0], [1, 1]), 'fighter', 'initial')).toBeNull();
  });

  it('keeps a big plane alone in its lane, and out of a lane with a plane in it', () => {
    expect(settle(held([0, 0]), 'bomber', 'formed')).toEqual({ lane: 1, rank: 0 });
    expect(settle(held([0, 0, 'bomber']), 'fighter', 'initial')).toEqual({ lane: 1, rank: 0 });
    expect(settle(held([0, 0], [1, 0]), 'bomber', 'initial')).toBeNull();
  });

  it('lays a place out where it says, and a plane leaving moves no other', () => {
    const both = layout(held([0, 0], [0, 1]));
    const left = layout([{ role: 'fighter', place: null }, ...held([0, 1])]);
    expect(left[0]).toBeNull();
    expect(left[1]).toEqual(both[1]);
  });
});

describe('the berths: where hulls rest along the mole (#475)', () => {
  it('puts the first hull at the berth the sequences know', () => {
    const [first] = berths(hulls('cargo'));
    const b = berthOf('cargo', beamOf(130));
    expect(first!.x).toBeCloseTo(b.x, 9);
    expect(first!.z).toBeCloseTo(b.z, 9);
    expect(Math.cos(first!.yaw - Math.PI)).toBeCloseTo(1, 9);
  });

  it('lays the second alongside the first, 1 m between their flanks, bows level', () => {
    const [a, b] = berths(hulls('cargo', 'escort'));
    const flank = a!.x - beamOf(130) / 2;
    expect(b!.x).toBeCloseTo(flank - 1 - beamOf(110) / 2, 9);
    // Their stems stand at the same z: middle minus half the length.
    expect(b!.z - 110 / 2).toBeCloseTo(a!.z - 130 / 2, 9);
  });

  it('anchors the third in the roads, past the mole head, off to sea', () => {
    const [a, , c] = berths(hulls('cargo', 'cargo', 'cargo'));
    // Its stem is clear of the mole's head, and it does not slip back along the quay.
    expect(c!.z - 130 / 2).toBeGreaterThan(MOLE.quay + MOLE.length + MOLE.head);
    expect(c!.x).toBeCloseTo(a!.x, 9);
    expect(c!.x).toBeLessThan(MOLE.inner);
  });

  it('keeps a fourth hull at its label', () => {
    expect(berths(hulls('cargo', 'cargo', 'cargo', 'cargo'))[3]).toBeNull();
  });

  it('gives each hull the growth it is drawn at', () => {
    const [a, b] = berths(hulls('cargo', 'escort'), 1, [2, 1]);
    expect(a!.z - MOLE.quay).toBeCloseTo(2 * (3 + 65), 9);
    expect(b!.z - MOLE.quay).toBeCloseTo(3 + 55, 9);
  });

  it('mirrors, and grows with the figurines', () => {
    const [a] = berths(hulls('cargo'));
    const [m] = berths(hulls('cargo'), -1);
    expect(m!.x).toBeCloseTo(-a!.x, 9);
    const [g] = berths(hulls('cargo'), 1, 2);
    expect(g!.z - MOLE.quay).toBeCloseTo(2 * (a!.z - MOLE.quay), 9);
  });
});
