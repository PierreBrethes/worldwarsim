import { describe, expect, it } from 'vitest';
import { isRigPart } from '@/emblems/rigs';
import { boardingOf, type Boarding } from './boarding';

/** A truck of 6.5 at (0, 0) facing +z, its rank to its left: two squads of three, men 0.4 tall. */
const scene = (down: boolean): Boarding => ({
  down,
  truck: { at: [0, 0], front: [0, 1], length: 6.5 },
  man: 0.4,
  step: 4,
  squads: [
    {
      men: [
        [-8, 0.5],
        [-8.5, -0.5],
        [-7.5, -0.6],
      ],
      heading: 0,
    },
    {
      men: [
        [-4, 0.5],
        [-4.5, -0.5],
        [-3.5, -0.6],
      ],
      heading: 0,
    },
  ],
});
const DOWN = (93 * Math.PI) / 180;

describe('boardingOf (#277)', () => {
  it('lets the tailgate hang until the last man is through, then shuts it: no fixed hold', () => {
    for (const down of [false, true]) {
      const { truck, squads } = boardingOf(scene(down));
      const gate = (t: number) => -(truck.at(t).tailgate?.turn?.[0] ?? 0);
      expect(truck.at(0)).toEqual({});
      expect(gate(700)).toBeCloseTo(DOWN, 1);
      // Every man hops while it hangs, however long the last one takes to come.
      let last = 0;
      for (const squad of squads)
        for (let t = 0; t < squad.ms; t += 10)
          for (const k of [0, 1, 2]) if ((squad.at(t)[`man_${k}`]?.hop ?? 0) > 0) last = t;
      expect(last).toBeGreaterThan(2000);
      expect(gate(last)).toBeGreaterThan(DOWN * 0.9);
      expect(gate(truck.ms - 1)).toBeLessThan(DOWN * 0.2);
      expect(truck.at(truck.ms)).toEqual({});
      for (const name of Object.keys(truck.at(1000)))
        expect(isRigPart('landTransport', name) || name.startsWith('fx_')).toBe(true);
    }
  });

  it('boards the men one by one: the nearest first, round to the foot, up the bed, swallowed', () => {
    const { squads } = boardingOf(scene(false));
    const near = squads[1]!;
    const far = squads[0]!;
    const hopsOf = (squad: (typeof squads)[number], k: number) => {
      for (let t = 0; t < squad.ms; t += 10)
        if ((squad.at(t)[`man_${k}`]?.travel?.[1] ?? 0) > 0) return t;
      return Infinity;
    };
    expect(hopsOf(near, 2)).toBeLessThan(hopsOf(far, 0));
    // Up on the bed, then gone in the dark.
    const end = near.at(near.ms - 2).man_0!;
    expect(end.travel![1]).toBeGreaterThan(0.3);
    expect(end.fade).toBeCloseTo(0, 2);
    // Never two on the tailgate at once.
    const hops = [0, 1, 2].flatMap((k) => [hopsOf(near, k), hopsOf(far, k)]).sort((a, b) => a - b);
    for (let k = 1; k < hops.length; k++) expect(hops[k]! - hops[k - 1]!).toBeGreaterThan(380);
  });

  it('brings them down the other way: out of the dark, the first out going furthest, to their places', () => {
    const { squads, settled } = boardingOf(scene(true));
    const far = squads[0]!;
    const near = squads[1]!;
    expect(far.at(0).man_0!.fade).toBe(0);
    const outOf = (squad: (typeof squads)[number], k: number) => {
      for (let t = 0; t < squad.ms; t += 10) if ((squad.at(t)[`man_${k}`]?.fade ?? 1) > 0) return t;
      return Infinity;
    };
    expect(outOf(far, 1)).toBeLessThan(outOf(near, 2));
    for (const squad of squads) {
      const at = squad.at(squad.ms - 1);
      for (const k of [0, 1, 2]) {
        const [x, y, z] = at[`man_${k}`]?.travel ?? [0, 0, 0];
        expect(Math.hypot(x, y, z)).toBeLessThan(0.05);
      }
      expect(squad.at(squad.ms)).toEqual({});
    }
    expect(settled).toBeGreaterThanOrEqual(Math.max(...squads.map((squad) => squad.ms)));
  });

  it('bends the knees at the hop, and sinks the bed under each foot', () => {
    const { squads, truck } = boardingOf(scene(false));
    const near = squads[1]!;
    let bent = 0;
    let sunk = 0;
    for (let t = 0; t < near.ms; t += 10) {
      bent = Math.max(bent, near.at(t).man_2?.hop ?? 0);
      sunk = Math.min(sunk, truck.at(t).body?.shift?.[1] ?? 0);
    }
    expect(bent).toBeGreaterThan(0.9);
    expect(sunk).toBeLessThan(-0.05);
  });

  it("raises dust at the tailgate's foot as each man lands, and none as they board", () => {
    const { squads, dust } = boardingOf(scene(true));
    expect(dust.times).toHaveLength(6);
    // The foot of the tailgate: behind the hinge, 4.9 m behind the middle of a 6.5 m truck.
    expect(dust.at[0]).toBeCloseTo(0, 5);
    expect(dust.at[1]).toBeCloseTo(-4.9, 5);
    // Each dust is the moment a man's travel is back to the ground.
    for (const t of dust.times) {
      const y = squads.flatMap((squad) =>
        [0, 1, 2].map((k) => squad.at(t)[`man_${k}`]?.travel?.[1] ?? 1),
      );
      expect(Math.min(...y)).toBeCloseTo(0, 5);
    }
    expect(boardingOf(scene(false)).dust.times).toEqual([]);
  });
});
