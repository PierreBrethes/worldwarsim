import { describe, expect, it } from 'vitest';
import {
  CRANE_S,
  craneAt,
  DOME_S,
  domeAt,
  HEADFRAME_S,
  headframeAt,
  PUMP_S,
  pumpAt,
  type PumpRig,
} from './at-rest';

const DEG = Math.PI / 180;
/** The ambient beat of the loops: 8 steps a second. */
const steps = (period: number) => Array.from({ length: period * 8 + 1 }, (_, k) => k / 8);

/** The pump jack of `oilWell.glb` today, in (y, z): its rods' feet read at the bottom of each rod. */
const PUMP: PumpRig = {
  crank: [1.6, -3],
  beam: [5.4, 0],
  arm: 3.5,
  rods: [
    { head: [5.39, -3.8], pin: [1.0, -3.4] },
    { head: [5.39, -3.8], pin: [1.0, -3.4] },
  ],
};
const CRANE = { foot: [-2.5, 2], head: [-41.47, 24.5], cable: 20, height: 22 } as const;

describe('the loops at rest (#273)', () => {
  it('rest at 0 and come back to it at their period', () => {
    const still = (pose: unknown) =>
      JSON.stringify(pose, (_, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 || 0 : v));
    expect(still(pumpAt(PUMP_S, PUMP))).toBe(still(pumpAt(0, PUMP)));
    expect(pumpAt(0, PUMP).beam).toBe(0);
    expect(headframeAt(0)).toEqual({ wheel: 0, cart: 0, bin: 0 });
    expect(still(headframeAt(HEADFRAME_S))).toBe(still(headframeAt(0)));
    expect(domeAt(0)).toEqual({ yaw: 0, lens: 0 });
    expect(still(domeAt(DOME_S))).toBe(still(domeAt(0)));
    const crane = craneAt(0, CRANE);
    expect([crane.slew, crane.lift, crane.cable]).toEqual([0, 0, 20]);
    expect(still(craneAt(CRANE_S, CRANE))).toBe(still(crane));
  });

  it('rocks the beam between its stops, −19° and +16°, once a stroke', () => {
    const beams = steps(PUMP_S).map((t) => pumpAt(t, PUMP).beam / DEG);
    expect(Math.max(...beams)).toBeCloseTo(16, 0);
    expect(Math.min(...beams)).toBeCloseTo(-19, 0);
  });

  it('keeps each rod from the beam to the crank pin', () => {
    for (const t of steps(PUMP_S)) {
      const { crank, beam, rods } = pumpAt(t, PUMP);
      const { head, pin } = PUMP.rods[0]!;
      const turn = (p: readonly number[], a: number, c: readonly number[]) => [
        c[0]! + (p[0]! - c[0]!) * Math.cos(a) - (p[1]! - c[1]!) * Math.sin(a),
        c[1]! + (p[0]! - c[0]!) * Math.sin(a) + (p[1]! - c[1]!) * Math.cos(a),
      ];
      const nowHead = turn(head, beam, PUMP.beam);
      const nowPin = turn(pin, crank, PUMP.crank);
      expect(head[0] + rods[0]!.shift[0]).toBeCloseTo(nowHead[0]!, 9);
      // The rod's foot, turned with it, points at the pin.
      const foot = turn(pin, rods[0]!.turn, head);
      const along = Math.atan2(foot[1]! - head[1], foot[0]! - head[0]);
      const toPin = Math.atan2(nowPin[1]! - nowHead[1]!, nowPin[0]! - nowHead[0]!);
      expect(Math.cos(along - toPin)).toBeCloseTo(1, 9);
    }
  });

  it('never turns a wheel more than half its spokes (60°) in one step: it never reads backwards', () => {
    const wheels = steps(HEADFRAME_S).map((t) => headframeAt(t).wheel);
    const moves = wheels.slice(1).map((w, k) => Math.abs(w - wheels[k]!));
    expect(Math.max(...moves)).toBeLessThanOrEqual(30 * DEG);
    expect(Math.max(...wheels)).toBeGreaterThan(Math.PI);
  });

  it('runs the tub to the end of its rail, tips it 110° there, and brings it back', () => {
    expect(headframeAt(6.5).cart).toBe(0);
    expect(headframeAt(9.5).cart).toBeCloseTo(1);
    expect(headframeAt(10.6).bin / DEG).toBeCloseTo(110);
    expect(headframeAt(11.7).bin).toBeCloseTo(0);
    expect(headframeAt(14.7).cart).toBeCloseTo(0);
  });

  it('aims the dome four times a cycle, each aim held 9 s', () => {
    expect(domeAt(5).yaw / DEG).toBeCloseTo(35);
    expect(domeAt(13).yaw / DEG).toBeCloseTo(35);
    expect(domeAt(33).yaw / DEG).toBeCloseTo(60);
    expect(domeAt(33).lens / DEG).toBeCloseTo(15);
    expect(domeAt(47).yaw).toBeCloseTo(0);
  });

  it('lowers the hook to 3 m over the yard, then 7,4 m over the hull, and rests pointed at the slip', () => {
    const over = (t: number) => {
      const { head, cable } = craneAt(t, CRANE);
      return head[1] - cable + CRANE.height;
    };
    expect(craneAt(13, CRANE).slew / DEG).toBeCloseTo(-110);
    expect(over(13)).toBeCloseTo(3);
    expect(over(29.5)).toBeCloseTo(7.4);
    expect(craneAt(40, CRANE)).toEqual(craneAt(0, CRANE));
  });
});
