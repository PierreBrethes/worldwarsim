import { describe, expect, it } from 'vitest';
import { isRigPart } from '@/emblems/rigs';
import { type PlaneBoarding, type PlaneRig, planeBoardingOf } from './plane-boarding';

/** The French plane's, measured on its GLB: a trial set, the engine reads the rig it draws. */
const FRENCH: PlaneRig = {
  hinge: [0.6915, 3.1025, -5.9439],
  foot: [2.1795, -6.3439],
  pitch: Math.atan2(2.16, 12.1),
};

/** The storyboard's yard at the board's origin: a metre of it 0.01 of the board, the plane facing
 *  +z (heading 0), its door on the +x flank; two squads of three, men 0.0175 tall. */
const squad = (x: number): PlaneBoarding['squads'][number] => ({
  men: [
    [x, 0.2],
    [x - 0.01, 0.18],
    [x + 0.01, 0.17],
  ],
});
const scene = (over: Partial<PlaneBoarding> = {}): PlaneBoarding => ({
  plane: { at: [0, 0], heading: 0, metre: 0.01, rig: FRENCH },
  man: 0.0175,
  squads: [squad(0.15), squad(0.3)],
  ...over,
});
const times = (ms: number) => Array.from({ length: Math.ceil(ms / 20) }, (_, k) => k * 20);
const door = (a: ReturnType<typeof planeBoardingOf>, t: number) =>
  a.plane!.at(t).cabin_door?.turn?.[1] ?? 0;
/** The man `k` of squad `s`: how far in he is — faded out, or not. */
const fade = (a: ReturnType<typeof planeBoardingOf>, s: number, k: number, t: number) =>
  a.squads[s]!.at(t)[`man_${k}`]?.fade ?? 1;
/** When each of the six is all but gone into the dark (the last 10 % of his fade). */
const gone = (a: ReturnType<typeof planeBoardingOf>) =>
  [0, 1].flatMap((s) =>
    [0, 1, 2].map((k) => times(a.settled).find((t) => fade(a, s, k, t) < 0.1) ?? Infinity),
  );

describe('planeBoardingOf, the door and the plank (#480, « 2. En avion »)', () => {
  it('is the rest pose before and after its sequence, and names only parts of the plane', () => {
    const a = planeBoardingOf(scene());
    const plane = a.plane!;
    expect(plane.family).toBe('airTransport');
    expect(plane.at(-1)).toEqual({});
    expect(plane.at(plane.ms)).toEqual({});
    for (const t of times(plane.ms))
      for (const name of Object.keys(plane.at(t)))
        expect(isRigPart('airTransport', name)).toBe(true);
  });

  it('swings the cabin door forward 100° about y, open from 0.8 s, and shuts it again', () => {
    const a = planeBoardingOf(scene());
    expect(door(a, 0)).toBe(0);
    expect(door(a, 300 + 500)).toBeCloseTo((-100 * Math.PI) / 180);
    expect(door(a, 600)).toBeLessThan(0);
    expect(door(a, 600)).toBeGreaterThan((-100 * Math.PI) / 180);
    const last = Math.max(...gone(a));
    expect(door(a, last)).toBeCloseTo((-100 * Math.PI) / 180);
    expect(door(a, a.plane!.ms - 1)).toBeCloseTo(0, 1);
  });

  it('stretches a plank, 0.5 m wide, from the sill (1.1 m up) to the foot on the ground', () => {
    const a = planeBoardingOf(scene());
    expect(a.plank(0)).toBeNull();
    const down = a.plank(300 + 300 + 350 + 100)!;
    expect(down.from[1]).toBeCloseTo(0.011, 2);
    expect(down.to[1]).toBeCloseTo(0, 5);
    expect(down.width).toBeCloseTo(0.005);
    // The door is on the +x flank: the foot is out from the sill, both aft of the wheels.
    expect(down.to[0]).toBeGreaterThan(down.from[0]);
    expect(down.to[2]).toBeLessThan(0);
  });

  it('runs the plank from the sill of the rig it is given to its foot, wherever they are', () => {
    // The Japanese door sits further forward and lower, the nose a little higher.
    const rig: PlaneRig = { hinge: [0.7, 2.6, -4.78], foot: [2.4, -5.2], pitch: 0 };
    const down = planeBoardingOf(scene({ plane: { ...scene().plane, rig } })).plank(1400)!;
    // No pitch: the sill is the hinge's lower edge, at the storyboard's offset, 0.01 a metre.
    expect(down.from[0]).toBeCloseTo((0.7 + 0.05) * 0.01);
    expect(down.from[1]).toBeCloseTo((2.6 - 0.88) * 0.01);
    expect(down.from[2]).toBeCloseTo((-4.78 - 0.4) * 0.01);
    expect(down.to[0]).toBeGreaterThan(down.from[0]);
    expect(down.to[2]).toBeCloseTo(-5.2 * 0.01, 5);
    expect(down.to[1]).toBeCloseTo(0, 5);
  });

  it('turns the sill and the foot with the plane', () => {
    const a = planeBoardingOf(
      scene({ plane: { at: [0, 0], heading: Math.PI / 2, metre: 0.01, rig: FRENCH } }),
    );
    const down = a.plank(1400)!;
    // Facing +x, its +x flank is -z, and aft is -x.
    expect(down.to[2]).toBeLessThan(down.from[2]);
    expect(down.to[0]).toBeLessThan(0);
  });

  it('draws the plank in before it shuts the door', () => {
    const a = planeBoardingOf(scene());
    const last = Math.max(...gone(a));
    expect(a.plank(last + 100)).not.toBeNull();
    expect(door(a, last + 500)).toBeCloseTo((-100 * Math.PI) / 180);
    expect(a.plank(last + 600)).toBeNull();
    expect(door(a, last + 700)).toBeGreaterThan((-100 * Math.PI) / 180);
  });
});

describe('planeBoardingOf, the men (#480)', () => {
  it('goes in one at a time, the nearest to the foot first, each 0.36 s after the one before', () => {
    const a = planeBoardingOf(scene());
    const at = gone(a);
    const sorted = [...at].sort((x, y) => x - y);
    for (let i = 1; i < sorted.length; i++)
      expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(340);
    // The squad at x = 0.15 stands nearer the foot (x = 0.02) than the one at 0.3.
    expect(Math.min(...at)).toBe(Math.min(at[0]!, at[1]!, at[2]!));
  });

  it('lets none climb while the one before is still on the plank, whatever the file', () => {
    // Six men set out together from one spot: the file would put them 0.32 s apart.
    const crowd = scene({
      squads: [{ men: Array.from({ length: 6 }, () => [0.3, 0.2] as const) }],
    });
    const a = planeBoardingOf(crowd);
    const at = [0, 1, 2, 3, 4, 5]
      .map((k) => times(a.settled).find((t) => (a.squads[0]!.at(t)[`man_${k}`]?.fade ?? 1) < 0.1)!)
      .sort((x, y) => x - y);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(340);
  });

  it('holds a man at his place until he sets out, and brings him to the foot as the plank is down', () => {
    const a = planeBoardingOf(scene());
    const pose = a.squads[0]!.at(0);
    expect(pose.man_0?.travel ?? [0, 0, 0]).toEqual([0, 0, 0]);
    // The first in climbs the plank: up to the sill's height, then swallowed.
    const t = gone(a)[0]!;
    const before = a.squads[0]!.at(t - 200).man_0!;
    expect(before.travel![1]).toBeGreaterThan(0);
    expect(before.travel![1]).toBeLessThanOrEqual(0.0111);
    expect(before.stride).toBeGreaterThan(0);
  });

  it('ends each squad once its last man is in, with nothing after', () => {
    const a = planeBoardingOf(scene());
    for (const s of a.squads) {
      expect(s.at(s.ms)).toEqual({});
      expect(s.at(s.ms - 1).man_0?.fade).toBe(0);
    }
    expect(a.settled).toBe(a.plane!.ms);
  });
});

describe('planeBoardingOf, reduced and off motion (#480)', () => {
  it('rings the plane with ink, 0.6 s, and plays nothing, when reduced', () => {
    const a = planeBoardingOf(scene(), 'reduced');
    expect(a.plane).toBeNull();
    expect(a.squads).toEqual([]);
    expect(a.plank(1000)).toBeNull();
    expect(a.ring).toEqual({ at: [0, 0], ms: 600 });
    expect(a.settled).toBe(600);
  });

  it('plays nothing at all when off', () => {
    const a = planeBoardingOf(scene(), 'off');
    expect(a).toMatchObject({ plane: null, squads: [], ring: null, settled: 0 });
  });
});
