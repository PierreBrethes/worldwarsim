import { describe, expect, it } from 'vitest';
import { MOLE } from '@/emblems/kits/manifest';
import {
  boardingVerdict,
  cutShort,
  deckWay,
  gangwayDoor,
  gangwayOf,
  plankAt,
  plankFoot,
  type P3,
  quayWay,
  vehicleWay,
} from './gangway';

/** A cargo's two gangway marks in the port's metres, the mole on the `+x` side. */
const NEAR = { x: 66, y: 3.6, z: 118 };
const FAR = { x: 47, y: 3.6, z: 118 };

describe('gangwayDoor (#479)', () => {
  it('takes the mark on the mole side, whichever of the two it is listed first (a hull berthed the other way, or in a port laid in mirror, turns the names over)', () => {
    expect(gangwayDoor([FAR, NEAR])).toBe(NEAR);
    expect(gangwayDoor([NEAR, FAR])).toBe(NEAR);
  });
});

describe('quayWay (#479)', () => {
  const door = NEAR;
  const way = quayWay({ x: 30, z: 99 }, door);

  it('runs along the quay, then the mole’s outer edge, crosses its deck and ends at the door', () => {
    expect(way.at(-1)).toEqual([door.x, door.y, door.z]);
    const xs = way.map(([x]) => x);
    // The outer edge is the furthest from the basin the men go.
    expect(Math.max(...xs)).toBeGreaterThan(MOLE.x);
    expect(Math.max(...xs)).toBeLessThan(MOLE.x + (MOLE.x - MOLE.inner));
    // Along it down to the door's station, then back across the deck to the foot of the plank.
    const outer = way.findIndex(([x]) => x === Math.max(...xs));
    expect(way[outer + 1]![2]).toBe(door.z);
    expect(way[way.length - 2]).toEqual(plankFoot(door));
  });

  it('lays the plank from the door to the deck, on the mole’s side of the door', () => {
    const [x, y] = plankFoot(door);
    expect(x).toBeGreaterThan(door.x);
    expect(y).toBeLessThan(door.y);
  });

  it('keeps every step before the door on the deck, level with the quay', () => {
    const deck = MOLE.lift + 0.5;
    for (const [, y] of way.slice(0, -1)) expect(y).toBe(deck);
  });
});

describe('vehicleWay (#505)', () => {
  const spot = { x: MOLE.inner + 1, y: 2.2, z: 160 };
  const way = vehicleWay({ x: 30, z: 99 }, spot);

  it('ends at the mast’s spot, level with the deck', () => {
    expect(way.at(-1)).toEqual([spot.x, MOLE.lift + 0.5, spot.z]);
    for (const [, y] of way) expect(y).toBe(MOLE.lift + 0.5);
  });

  it('goes down the mole by a lane inside its deck, not by its outer edge, to the spot’s station', () => {
    const lane = way.filter(([, , z]) => z === spot.z);
    expect(lane[0]![0]).toBeGreaterThan(MOLE.inner);
    expect(lane[0]![0]).toBeLessThan(MOLE.x);
  });

  it('crosses the quay line first, from a rank on the land side', () => {
    expect(way[0]).toEqual([30, MOLE.lift + 0.5, MOLE.quay - 2]);
  });
});

/** Two squads of three men a metre apart, 1.8 tall, each on his path from his own rest. */
const rest = (x: number): P3[] => [
  [x, 0, 0],
  [x + 60, 0, 0],
  [x + 60, 0, 40],
];
const squad = (x: number) => ({ men: [0, 1, 2].map((k) => rest(x - k)) });

describe('gangwayOf (#479)', () => {
  const plan = gangwayOf({ man: 1.8, squads: [squad(0), squad(-20)] });

  it('sends the nearest man first, one after the other, never two on one step', () => {
    const starts = plan.squads.map((s) => {
      for (let t = 0; t < s.ms; t += 10) if (s.at(t).man_0?.stride !== undefined) return t;
      return Infinity;
    });
    expect(starts[0]).toBeLessThan(starts[1]!);
  });

  it('walks a man along his path from his rest, level with the way, and out of sight at the door', () => {
    const s = plan.squads[0]!;
    // Midway, the man is on his first leg, off his rest along +x.
    const mid = s.at(plan.through[0]! / 3).man_0!;
    expect(mid.travel![0]).toBeGreaterThan(0);
    expect(mid.heading).toBeCloseTo(Math.PI / 2, 1);
    const last = s.at(plan.through[0]! - 5);
    expect(Math.min(...[0, 1, 2].map((k) => last[`man_${k}`]?.fade ?? 1))).toBeLessThan(0.2);
    // Through the door he is gone: the stand-in stays drawn but empty.
    expect(s.at(s.ms - 1).man_0?.fade).toBe(0);
    expect(s.at(s.ms)).toEqual({});
  });

  it('plays in the pool of the pieces that board, with the lifted vehicles', () => {
    for (const s of plan.squads) expect(s.pool).toBe('boarding');
  });

  it('tells when each squad’s last man is through the door, in order of arrival', () => {
    expect(plan.through).toHaveLength(2);
    expect(plan.through[0]).toBeLessThan(plan.through[1]!);
    expect(plan.settled).toBeGreaterThan(plan.through[1]!);
  });

  it('lays the plank before the first man leaves and takes it in after the last is through', () => {
    const first = Math.min(
      ...plan.squads.map((s) => {
        for (let t = 0; t < s.ms; t += 10) if (s.at(t).man_0?.stride !== undefined) return t;
        return Infinity;
      }),
    );
    expect(plankAt(0, plan.plank)).toBe(0);
    // The first man walks a long way to its foot while it falls.
    expect(plankAt(first, plan.plank)).toBeGreaterThan(0.9);
    expect(plankAt(Math.max(...plan.through) + 1, plan.plank)).toBe(1);
    expect(plankAt(plan.settled, plan.plank)).toBe(0);
  });

  it('plays nothing for a squad with no man', () => {
    const none = gangwayOf({ man: 1.8, squads: [{ men: [] }] });
    expect(none.squads[0]!.at(100)).toEqual({});
    expect(none.through).toEqual([0]);
  });
});

describe('deckWay (#506)', () => {
  const head = { x: 60, y: 17, z: 160 };
  const spot = { x: 44, y: 17, z: 168 };
  const way = deckWay({ x: 30, z: 99 }, head, spot);

  it('goes as to a door at the deck’s edge, then walks the deck to its spot on the lift', () => {
    expect(way.at(-1)).toEqual([spot.x, spot.y, spot.z]);
    expect(way.at(-2)).toEqual([head.x, head.y, head.z]);
    expect(way.at(-3)).toEqual(plankFoot(head));
  });
});

describe('the men of a carrier’s boarding, taken down by its lift (#506)', () => {
  const drop = 6.5;
  const plan = gangwayOf({ man: 1.8, squads: [squad(0), squad(-20)], lift: { drop } });
  const lift = plan.lift!;
  const men = (t: number) =>
    plan.squads.flatMap((s) => [0, 1, 2].map((k) => s.at(t)[`man_${k}`]!)).filter(Boolean);

  it('keeps every man whole on the lift, level, until it starts down', () => {
    for (const man of men(lift.start - 1)) {
      expect(man.fade).toBe(1);
      expect(man.travel![1]).toBeCloseTo(0, 6);
      expect(man.stride).toBeUndefined();
    }
  });

  it('starts only once the last man is on it, and lets the plank go as it does', () => {
    expect(lift.start).toBeGreaterThan(plan.plank.up - 1);
    expect(lift.depth(lift.start - 1)).toBe(0);
  });

  it('takes them down its whole drop and out of sight in the dark, then comes up empty', () => {
    expect(lift.depth(lift.bottom)).toBe(1);
    for (const man of men(lift.bottom - 1)) expect(man.fade).toBeLessThan(0.1);
    for (const man of men(lift.start + (lift.bottom - lift.start) / 2))
      expect(man.travel![1]).toBeLessThan(0);
    const last = plan.squads[0]!.at(plan.squads[0]!.ms - 1);
    expect(last.man_0?.fade).toBe(0);
    expect(last.man_0?.travel![1]).toBeCloseTo(-drop, 6);
    expect(lift.depth(lift.end - 200)).toBeLessThan(1);
    expect(lift.depth(lift.end - 200)).toBeGreaterThan(0);
    expect(lift.depth(plan.settled)).toBe(0);
  });

  it('tells the tag the men are through once the dark has taken them', () => {
    expect(plan.through).toEqual([lift.bottom, lift.bottom]);
    expect(plan.settled).toBeGreaterThan(lift.bottom);
  });

  it('has no lift at all for a gangway that opens on a door', () => {
    expect(gangwayOf({ man: 1.8, squads: [squad(0)] }).lift).toBeNull();
  });
});

describe('boardingVerdict (#479)', () => {
  const ready = {
    role: 'cargo',
    post: 'mole',
    motion: 'full',
    veiled: false,
    big: true,
  } as const;

  it('plays for a cargo at the mole, in the field, at full motion', () => {
    expect(boardingVerdict(ready)).toBe('play');
  });

  it('plays for a carrier at the mole too: its men go up a plank to the deck (#506)', () => {
    expect(boardingVerdict({ ...ready, role: 'carrier' })).toBe('play');
    expect(boardingVerdict({ ...ready, role: 'carrier', post: 'couple' })).toBeNull();
  });

  it('poses at once any other hull: an escort has nowhere to take its men', () => {
    expect(boardingVerdict({ ...ready, role: 'escort' })).toBeNull();
  });

  it('poses at once a hull at the mole’s side or in the roads: no gangway reaches it', () => {
    expect(boardingVerdict({ ...ready, post: 'couple' })).toBeNull();
    expect(boardingVerdict({ ...ready, post: 'roads' })).toBeNull();
  });

  it('waits while the hull has no post yet (just docked, or the view just loaded)', () => {
    expect(boardingVerdict({ ...ready, post: null })).toBe('wait');
  });

  it('refuses an escort whose post is not known either: the role comes first', () => {
    expect(boardingVerdict({ ...ready, role: 'escort', post: null })).toBeNull();
  });

  it('plays nothing under a combat, out of the field, or off full motion', () => {
    expect(boardingVerdict({ ...ready, veiled: true })).toBeNull();
    expect(boardingVerdict({ ...ready, big: false })).toBeNull();
    expect(boardingVerdict({ ...ready, motion: 'reduced' })).toBeNull();
    expect(boardingVerdict({ ...ready, motion: 'off' })).toBeNull();
  });
});

describe('cutShort (#479)', () => {
  it('is cut while a man still walks, and not once the last is through: the plank is taken in on its own', () => {
    const through = [3000, 5000];
    expect(cutShort(4000, through)).toBe(true);
    expect(cutShort(5001, through)).toBe(false);
    expect(cutShort(5400, through)).toBe(false);
  });
});

describe('the men of a boarding (#479)', () => {
  it('walk in from out of the field: the hull is the piece judged, not each man', () => {
    const { squads } = gangwayOf({ man: 1.8, squads: [squad(0)] });
    expect(squads[0]!.anywhere).toBe(true);
  });
});
