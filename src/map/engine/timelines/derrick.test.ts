import { describe, expect, it } from 'vitest';
import { aimAt, BOOM, type Boom, hoistsOf, HOOK, liftOf, SLING, strokesAt, tipOf } from './derrick';
import { Group, Object3D } from 'three';
import { boomsOfScene } from './booms';

/** A boom at the hull's middle, its hold 17 m forward of it: the file's shape, in hull metres. */
const BOOM_1: Boom = {
  n: 1,
  length: BOOM,
  pivot: [0.6, 6.5, 27.8],
  rest: { yaw: 0, lift: 0.43 },
  hatch: { at: [0, 5.2, 35.65], rim: 5.2 },
};
const SPOT: readonly [number, number, number] = [-10, 2.2, 27.8];

describe('the boom’s tip (#505)', () => {
  it('stands a boom’s length from its pivot, along its heading and above it by its lift', () => {
    const tip = tipOf([1, 2, 3], Math.PI / 2, 0.4);
    expect(tip[0]).toBeCloseTo(1 + BOOM * Math.cos(0.4), 6);
    expect(tip[1]).toBeCloseTo(2 + BOOM * Math.sin(0.4), 6);
    expect(tip[2]).toBeCloseTo(3, 6);
    const rest = tipOf([0, 0, 0], 0, 0);
    expect(rest).toEqual([0, 0, BOOM]);
  });

  it('is aimed over a point of the deck: its tip comes to stand above it', () => {
    const { yaw, lift } = aimAt([0.6, 6.5, 27.8], -10, 27.8);
    const tip = tipOf([0.6, 6.5, 27.8], yaw, lift);
    expect(tip[0]).toBeCloseTo(-10, 6);
    expect(tip[2]).toBeCloseTo(27.8, 6);
    expect(yaw).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('is never aimed beyond its reach: it stands short, nearly flat', () => {
    const { lift } = aimAt([0, 6.5, 0], 50, 0);
    expect(lift).toBeGreaterThanOrEqual(0);
    expect(lift).toBeLessThan(0.2);
  });
});

describe('a lift (#505)', () => {
  const lift = liftOf({ boom: BOOM_1, spot: SPOT, height: 3, start: 1000 });
  const over = (t: number) => lift.at(t);

  it('rests the mast until it starts, then brings its tip over the pick-up spot', () => {
    expect(over(0).yaw).toBeCloseTo(BOOM_1.rest.yaw, 6);
    expect(over(0).lift).toBeCloseTo(BOOM_1.rest.lift, 6);
    const pick = over(lift.pick);
    expect(tipOf(BOOM_1.pivot, pick.yaw, pick.lift)[0]).toBeCloseTo(SPOT[0], 3);
  });

  it('takes the load off the deck, over to its hold, and lowers it out of sight', () => {
    expect(over(lift.pick).load).toBeNull();
    const high = over(lift.over - 1);
    expect(high.load).not.toBeNull();
    // Above the deck it was taken from.
    expect(high.load![1]).toBeGreaterThan(SPOT[1] + 3);
    const down = over(lift.dropped);
    const tip = tipOf(BOOM_1.pivot, down.yaw, down.lift);
    expect(tip[0]).toBeCloseTo(BOOM_1.hatch.at[0], 3);
    expect(tip[2]).toBeCloseTo(BOOM_1.hatch.at[2], 3);
    expect(down.fade).toBe(0);
  });

  it('hangs the hook under the tip and the load a hook and a sling under it', () => {
    const t = (lift.lifted + lift.over) / 2;
    const s = over(t);
    const tip = tipOf(BOOM_1.pivot, s.yaw, s.lift);
    expect(s.hook[0]).toBeCloseTo(tip[0], 6);
    expect(s.hook[1]).toBeCloseTo(tip[1] - s.cable, 6);
    // The load's bottom is its height under its top, which hangs under the hook.
    expect(s.load![1]).toBeCloseTo(s.hook[1] - HOOK - SLING - 3, 6);
  });

  it('fades the load as it passes the coaming, not before', () => {
    expect(over(lift.over).fade).toBe(1);
    expect(over(lift.lifted).fade).toBe(1);
    const mid = lift.over + (lift.dropped - lift.over) * 0.85;
    expect(over(mid).fade).toBeLessThan(1);
    expect(over(mid).fade).toBeGreaterThan(0);
    // Whatever the moment, a load above the coaming is whole.
    for (let t = lift.start; t < lift.end; t += 25) {
      const s = over(t);
      if (s.load !== null && s.load[1] >= BOOM_1.hatch.rim) expect(s.fade).toBe(1);
    }
  });

  it('opens its hatch with the mast and shuts it once the hook is up', () => {
    expect(lift.hatchAt(lift.start - 1)).toBe(0);
    expect(lift.hatchAt(lift.over)).toBe(1);
    expect(lift.hatchAt(lift.end)).toBe(0);
  });

  it('hooks only between the slinging and the drop', () => {
    expect(over(lift.start).hooked).toBe(false);
    expect(over(lift.lifted).hooked).toBe(true);
    expect(over(lift.dropped + 10).hooked).toBe(false);
  });
});

describe('the lifts of a boarding (#505)', () => {
  const stationA = { ...BOOM_1 };
  const sameStation: Boom = { ...BOOM_1, n: 2, pivot: [-0.6, 6.5, 27.8] };
  const stationB: Boom = {
    ...BOOM_1,
    n: 3,
    pivot: [0.6, 6.6, -31],
    hatch: { at: [0, 5.3, -24], rim: 5.3 },
  };
  const vehicle = (drive: number) => ({ drive: () => drive, height: 3 });

  it('lifts one vehicle after another by a mast of its own, the stations alternating', () => {
    const plan = hoistsOf({
      booms: [stationA, sameStation, stationB],
      grounds: [SPOT, SPOT, [-10, 2.2, -31]],
      vehicles: [vehicle(2000), vehicle(2000)],
    });
    expect(plan.lifts.map(({ boom }) => boom)).toEqual([0, 2]);
  });

  it('holds the next vehicle back from a spot until the one on it is off the deck', () => {
    const plan = hoistsOf({
      booms: [stationA, sameStation],
      grounds: [SPOT, SPOT],
      vehicles: [vehicle(2000), vehicle(2000)],
    });
    const [first, second] = plan.lifts;
    expect(second!.arrive).toBeGreaterThanOrEqual(first!.lift.lifted);
    expect(second!.driveStart + 2000).toBeCloseTo(second!.arrive, 3);
  });

  it('lifts again with a mast already used when the booms are fewer than the vehicles', () => {
    const plan = hoistsOf({
      booms: [stationA],
      grounds: [SPOT],
      vehicles: [vehicle(1000), vehicle(1000), vehicle(1000)],
    });
    const lifts = plan.lifts.map(({ lift }) => lift);
    expect(lifts[1]!.start).toBeGreaterThanOrEqual(lifts[0]!.end);
    expect(lifts[2]!.start).toBeGreaterThanOrEqual(lifts[1]!.end);
  });

  it('rests every mast of the hull but the ones that lift, and ends once all are home', () => {
    const plan = hoistsOf({
      booms: [stationA, stationB],
      grounds: [SPOT, [-10, 2.2, -31]],
      vehicles: [vehicle(1000)],
    });
    const mid = plan.lifts[0]!.lift.over;
    const pose = plan.hull.at(mid);
    expect(pose.mat_charge_1?.aim).toBeDefined();
    expect(pose.mat_charge_3).toBeUndefined();
    expect(pose.hold_hatch_1?.turn).toBeDefined();
    expect(plan.hull.at(plan.hull.ms)).toEqual({});
    expect(plan.settled).toBeGreaterThanOrEqual(plan.lifts[0]!.lift.end);
  });

  it('never starts a mast before the hull’s copy has had time to stand', () => {
    const plan = hoistsOf({
      booms: [stationA],
      grounds: [SPOT],
      vehicles: [vehicle(0)],
    });
    expect(plan.lifts[0]!.lift.start).toBeGreaterThanOrEqual(600);
    expect(plan.lifts[0]!.driveStart).toBeGreaterThanOrEqual(0);
  });

  it('plays nothing with no vehicle', () => {
    const plan = hoistsOf({ booms: [stationA], grounds: [SPOT], vehicles: [] });
    expect(plan.lifts).toEqual([]);
    expect(plan.hull.at(10)).toEqual({});
  });
});

describe('the strokes of a lift (#505)', () => {
  const lift = liftOf({ boom: BOOM_1, spot: SPOT, height: 3, start: 1000 });
  it('draws nothing while the mast is at rest outside its lift', () => {
    expect(strokesAt(BOOM_1, lift, 0)).toEqual([]);
    expect(strokesAt(BOOM_1, lift, lift.end)).toEqual([]);
  });

  it('runs the cable from the tip to the hook, and slings only once the load is slung', () => {
    const early = strokesAt(BOOM_1, lift, lift.pick + 100);
    expect(early).toHaveLength(2);
    const tip = tipOf(BOOM_1.pivot, lift.at(lift.pick + 100).yaw, lift.at(lift.pick + 100).lift);
    expect(early[0]!.a[0]).toBeCloseTo(tip[0], 6);
    expect(early[0]!.b).toEqual(lift.at(lift.pick + 100).hook);
    const slung = strokesAt(BOOM_1, lift, (lift.lifted + lift.over) / 2);
    expect(slung).toHaveLength(6);
    // The slings end on the load's top, a hook and a sling under the hook's top.
    const top = lift.at((lift.lifted + lift.over) / 2);
    expect(slung[2]!.b[1]).toBeCloseTo(top.hook[1] - HOOK - SLING, 6);
  });
});

describe('boomsOfScene (#505)', () => {
  const scene = new Group();
  const mat = (name: string, x: number, z: number, flip: number) => {
    const node = new Object3D();
    node.name = name;
    node.position.set(x, 6.5, z);
    // Its z along (0, 0.42, 0.91): turned about x by its lift.
    node.rotation.set(-0.43, flip, 0, 'YXZ');
    scene.add(node);
  };
  mat('mat_charge_2', -0.6, 27.8, Math.PI);
  mat('mat_charge_1', 0.6, 27.8, 0);
  for (const [k, z] of [
    [1, 35.65],
    [2, 19.95],
  ] as const) {
    const hatch = new Object3D();
    hatch.name = `hold_hatch_${k}`;
    hatch.position.set(4.25, 5.18, z);
    scene.add(hatch);
    const dark = new Object3D();
    dark.name = `fond_sombre_${k}`;
    dark.position.set(0, 4.88, z);
    scene.add(dark);
  }

  it('reads each boom’s pivot, rest and hatch, in the order of its number', () => {
    const booms = boomsOfScene(scene);
    expect(booms.map((boom) => boom.n)).toEqual([1, 2]);
    expect(booms[0]!.pivot).toEqual([0.6, 6.5, 27.8]);
    expect(booms[0]!.rest.yaw).toBeCloseTo(0, 6);
    expect(booms[0]!.rest.lift).toBeCloseTo(0.43, 6);
    expect(Math.abs(booms[1]!.rest.yaw)).toBeCloseTo(Math.PI, 6);
    expect(booms[0]!.hatch).toEqual({ at: [0, 5.18, 35.65], rim: 5.18 });
  });
});
