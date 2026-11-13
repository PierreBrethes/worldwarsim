import { describe, expect, it } from 'vitest';
import { MOLE } from '@/emblems/kits/manifest';
import {
  boardingVerdict,
  cutShort,
  gangwayDoor,
  gangwayOf,
  plankAt,
  plankFoot,
  type P3,
  quayWay,
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

  it('poses a carrier at once: its coupée is #506’s', () => {
    expect(boardingVerdict({ ...ready, role: 'carrier' })).toBeNull();
  });

  it('poses at once a hull at the mole’s side or in the roads: no gangway reaches it', () => {
    expect(boardingVerdict({ ...ready, post: 'couple' })).toBeNull();
    expect(boardingVerdict({ ...ready, post: 'roads' })).toBeNull();
  });

  it('waits while the hull has no post yet (just docked, or the view just loaded)', () => {
    expect(boardingVerdict({ ...ready, post: null })).toBe('wait');
  });

  it('refuses a carrier whose post is not known either: the role comes first', () => {
    expect(boardingVerdict({ ...ready, role: 'carrier', post: null })).toBeNull();
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
