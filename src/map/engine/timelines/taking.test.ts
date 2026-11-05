import { describe, expect, it } from 'vitest';
import { MAN_METRES } from '@/domain/piece-size';
import {
  aroundTheFront,
  crateSearch,
  crateTaking,
  perronOf,
  plunderOf,
  sabotageOf,
  TAKING,
  takingStepOf,
} from './taking';

const to = [3, 0, 4] as const;
/** He stops where the crate lies at his feet, before him (`crateOnMan(0)`). */
const short = 1 - (0.35 * MAN_METRES) / 5;

describe('crateTaking (#279, « Ramasser »)', () => {
  const taking = crateTaking({ part: 'man_0', to, perMetre: 1 });

  it('rests on the pile at the start and once over', () => {
    expect(taking.at(0)).toEqual({});
    expect(taking.at(taking.ms)).toEqual({});
  });

  it('walks one man to the crate, facing it, marching', () => {
    const { man_0 } = taking.at(TAKING.crateWalk / 2);
    expect(man_0?.travel?.[0]).toBeGreaterThan(0);
    expect(man_0?.travel?.[0]).toBeLessThan(3);
    expect(man_0?.heading).toBeCloseTo(Math.atan2(3, 4));
    expect(man_0?.stride).toBeGreaterThan(0);
    expect(man_0?.carry).toBeUndefined();
  });

  it('finds the crate on the ground at its point, until he takes it', () => {
    expect(taking.at(1).man_0?.lying).toEqual({ at: to, shown: 1 });
    expect(taking.at(TAKING.crateWalk / 2).man_0?.lying).toEqual({ at: to, shown: 1 });
    expect(taking.at(TAKING.crateWalk + 1).man_0?.lying).toBeUndefined();
  });

  it('bends over the crate, then shoulders it', () => {
    const bending = taking.at(TAKING.crateWalk + TAKING.bend / 2).man_0!;
    expect(bending.travel![0]).toBeCloseTo(3 * short);
    expect(bending.travel![2]).toBeCloseTo(4 * short);
    expect(bending.carry![0]).toBeGreaterThan(0);
    expect(bending.carry![1]).toBe(0);
    const lifted = taking.at(TAKING.crateWalk + TAKING.bend + TAKING.lift).man_0!;
    expect(lifted.carry).toEqual([0, 1, 1]);
  });

  it('carries it back to his place, where it fades into the rank', () => {
    const back = TAKING.crateWalk + TAKING.bend + TAKING.lift;
    const walking = taking.at(back + TAKING.crateWalk / 2).man_0!;
    expect(walking.heading).toBeCloseTo(Math.atan2(-3, -4));
    expect(walking.carry).toEqual([0, 1, 1]);
    const home = taking.at(back + TAKING.crateWalk + TAKING.tag / 2).man_0!;
    expect(home.travel).toEqual([0, 0, 0]);
    expect(home.lying).toBeUndefined();
    expect(home.carry![2]).toBeLessThan(1);
    expect(home.carry![2]).toBeGreaterThan(0);
  });
});

describe('crateSearch (#279, « Ramasser », la caisse partie)', () => {
  const search = crateSearch({ part: 'man_0', to, perMetre: 1 });
  const there = TAKING.crateWalk;

  it('walks to where the crate lay, looks left and right, finds nothing, and comes back', () => {
    expect(search.at(there / 2).man_0?.lying).toEqual({ at: to, shown: 1 });
    const looking = search.at(there + TAKING.search / 4).man_0!;
    expect(looking.travel![0]).toBeCloseTo(3 * short);
    expect(looking.heading).not.toBeCloseTo(Math.atan2(3, 4));
    expect(looking.carry).toBeUndefined();
    expect(search.at(there + TAKING.search / 2).man_0?.lying?.shown ?? 0).toBe(0);
    const home = search.at(search.ms - 1).man_0!;
    expect(home.travel).toEqual([0, 0, 0]);
    expect(home.carry).toBeUndefined();
    expect(home.lying).toBeUndefined();
  });
});

describe('plunderOf (#279, « Piller »)', () => {
  const plunder = plunderOf({
    trips: [
      { part: 'man_0', to },
      { part: 'man_1', to },
    ],
    perMetre: 1,
  });

  it('sends two men to the door, who come back a crate on the shoulder', () => {
    const out = TAKING.walk * 1.4;
    const both = plunder.at(out / 2);
    expect(Object.keys(both)).toEqual(['man_0', 'man_1']);
    const back = plunder.at(out + TAKING.lift + 150 + out / 2);
    expect(back.man_0?.carry?.[1]).toBe(1);
    expect(back.man_1?.carry?.[1]).toBe(1);
    expect(plunder.at(plunder.ms - 1).man_0?.travel).toEqual([0, 0, 0]);
  });

  it('walks a man round by his way, there and back, when the perron is not in his sight', () => {
    const via = [[6, 0, 0] as const, [6, 0, 4] as const];
    const round = plunderOf({ trips: [{ part: 'man_0', to, via }], perMetre: 1 });
    const out = round.takenAt;
    const passes = (from: number, until: number) =>
      via.every((point) =>
        Array.from(
          { length: 401 },
          (_, k) => round.at(from + ((until - from) * (k + 1)) / 402).man_0,
        )
          .map((pose) => pose!.travel!)
          .some((at) => Math.hypot(at[0] - point[0], at[2] - point[2]) < 0.05),
      );
    expect(passes(0, out)).toBe(true);
    const back = out + TAKING.lift + 150;
    expect(passes(back, back + out)).toBe(true);
    // He still stops short of the crate, and comes home to his place.
    expect(round.at(out + 1).man_0?.travel?.[2]).toBeCloseTo(4);
    expect(round.at(round.ms - 1).man_0?.travel).toEqual([0, 0, 0]);
  });

  it('takes the crates off the top of the perron as the men shoulder theirs', () => {
    const perron = perronOf(plunder, ['caisse_5', 'caisse_4']);
    expect(perron.family).toBe('warehouse');
    expect(perron.ms).toBe(plunder.ms);
    expect(perron.at(plunder.takenAt - 1).caisse_5?.fade ?? 1).toBe(1);
    expect(plunder.at(plunder.takenAt + 1).man_0?.carry?.[2]).toBeLessThan(1);
    expect(perron.at(plunder.takenAt + TAKING.swap).caisse_5?.fade).toBe(0);
    expect(perron.at(plunder.takenAt + TAKING.swap).caisse_4?.fade).toBe(0);
    expect(plunder.at(plunder.takenAt + TAKING.swap).man_0?.carry?.[2]).toBe(1);
    expect(perron.at(plunder.ms - 1).caisse_4?.fade).toBe(0);
  });
});

describe('sabotageOf (#279, « Saboter »)', () => {
  const sabotage = sabotageOf({
    trips: [
      { part: 'man_0', to },
      { part: 'man_1', to },
    ],
    perMetre: 1,
  });

  it('swallows two men in the dark of the door while the smoke rises, then gives them back', () => {
    const inside = TAKING.walk * 1.6;
    expect(sabotage.at(inside / 2).man_0?.fade ?? 1).toBe(1);
    expect(sabotage.at(inside + TAKING.swallow).man_0?.fade).toBe(0);
    expect(sabotage.smokeAt).toBeGreaterThan(inside + TAKING.swallow);
    expect(sabotage.at(sabotage.smokeAt + 100).man_1?.fade).toBe(0);
    expect(sabotage.at(sabotage.ms - 1).man_0?.fade).toBe(1);
    expect(sabotage.at(sabotage.ms - 1).man_0?.carry).toBeUndefined();
  });
});

describe('takingStepOf (#279, « Réduites et coupées »)', () => {
  it('plays at full motion, rings the site or the pile at reduced, and shows nothing cut', () => {
    expect(takingStepOf('full')).toBe('play');
    expect(takingStepOf('reduced')).toBe('ring');
    expect(takingStepOf('off')).toBe('nothing');
  });
});

/** #279 : la caisse prise sort par la porte, à l'épaule d'un homme (storyboard « Piller »). */
describe('aroundTheFront (#279, « Piller »)', () => {
  // The socle, and the building on it: the door looks to +z, the crate lies before it.
  const box = { minX: -38, maxX: 38, minZ: -28, maxZ: 48 };
  const building = { minX: -30, maxX: 30, minZ: -20, maxZ: 20 };
  const crate = [-4.7, 24] as const;

  it('takes a man behind the building round its side, to the front of its door', () => {
    expect(aroundTheFront([0, -26], crate, 0, box, building)).toEqual([
      [38, -26],
      [38, 24],
    ]);
    expect(aroundTheFront([-30, -25], crate, 0, box, building)).toEqual([
      [-38, -25],
      [-38, 24],
    ]);
  });

  it('lets a man go straight whom nothing stands in the way of, just short of the crate too', () => {
    expect(aroundTheFront([-20, 44], crate, 0, box, building)).toEqual([]);
    // A hair behind the crate's depth, beside the building: he is clear of it, not "behind" it.
    expect(aroundTheFront([35, 23.9], crate, 0, box, building)).toEqual([]);
    expect(aroundTheFront([-4.7, 23.9], crate, 0, box, building)).toEqual([]);
  });

  it('reads the front by the door, however the site is turned', () => {
    const [[x, z]] = aroundTheFront([10, 0], [21, 0], Math.PI / 2, box, {
      minX: -10,
      maxX: 14,
      minZ: -20,
      maxZ: 20,
    }) as [[number, number]];
    expect(x).toBeCloseTo(10);
    expect(z).toBeCloseTo(-28);
  });

  it('does the same for a door turned half a turn', () => {
    const behind = aroundTheFront([0, 26], [4.7, -24], Math.PI, box, building);
    expect(behind).toHaveLength(2);
    expect(Math.abs(behind[0]![0])).toBeCloseTo(38);
    expect(behind[0]![1]).toBeCloseTo(26);
    expect(behind[1]![1]).toBeCloseTo(-24);
    expect(aroundTheFront([35, -23.9], [4.7, -24], Math.PI, box, building)).toEqual([]);
  });
});

describe('plunderOf, round the building (#279)', () => {
  const via: ReadonlyArray<readonly [number, number, number]> = [
    [6, 0, 0],
    [6, 0, 4],
  ];
  const target = [3, 0, 4] as const;
  const straight = plunderOf({ trips: [{ part: 'man_0', to: target }], perMetre: 1 });
  const round = plunderOf({ trips: [{ part: 'man_0', to: target, via }], perMetre: 1 });

  it('keeps his pace: the longer way takes as much longer as it is longer', () => {
    const shorted = (p: readonly [number, number, number]) => {
      const end = via[1]!;
      const k = 1 - (0.35 * MAN_METRES) / Math.hypot(p[0] - end[0], p[2] - end[2]);
      return [end[0] + (p[0] - end[0]) * k, end[2] + (p[2] - end[2]) * k] as const;
    };
    const [tx, tz] = shorted(target);
    const direct = Math.hypot(tx, tz);
    const way = 6 + 4 + Math.hypot(tx - 6, tz - 4);
    expect(round.takenAt / straight.takenAt).toBeCloseTo(way / direct, 2);
    // He comes back at the same pace.
    const back = (plan: typeof round) => plan.ms - plan.takenAt;
    expect((back(round) - TAKING.lift) / (back(straight) - TAKING.lift)).toBeGreaterThan(1.3);
  });

  it('comes back by his way out, the corners in the reverse order', () => {
    const man = (t: number) => round.at(t).man_0!.travel!;
    const nearest = (from: number, until: number, point: readonly [number, number, number]) => {
      let best = { t: 0, d: Infinity };
      for (let k = 0; k <= 800; k++) {
        const t = from + ((until - from) * k) / 800;
        const at = man(Math.max(1, Math.min(round.ms - 1, t)));
        const d = Math.hypot(at[0] - point[0], at[2] - point[2]);
        if (d < best.d) best = { t, d };
      }
      return best.t;
    };
    const back = round.takenAt + TAKING.lift + 150;
    const goes = [nearest(0, round.takenAt, via[0]!), nearest(0, round.takenAt, via[1]!)];
    const comes = [nearest(back, round.ms, via[1]!), nearest(back, round.ms, via[0]!)];
    expect(goes[0]).toBeLessThan(goes[1]!);
    expect(comes[0]).toBeLessThan(comes[1]!);
    expect(man(goes[0]!)[0]).toBeCloseTo(6, 0);
    expect(man(comes[1]!)[0]).toBeCloseTo(6, 0);
  });
});
