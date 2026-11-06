import { describe, expect, it } from 'vitest';
import {
  CRANE_S,
  craneAt,
  craneParts,
  craneToward,
  craneVisit,
  DOME_S,
  domeAt,
  HEADFRAME_S,
  headframeAt,
  PORT_CRANE,
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

describe('the crane comes to a hull at the mole (#477)', () => {
  const { rig, ring } = PORT_CRANE;
  const jib = Math.hypot(rig.head[0] - rig.foot[0], rig.head[1] - rig.foot[1]);
  const rest = Math.atan2(rig.head[1] - rig.foot[1], rig.foot[0] - rig.head[0]);
  // A cargo's fore deck at the mole: its stem 3 m off the quay, the hook 6 m abaft it.
  const from = (point: { x: number; z: number }) => ({ x: point.x - ring.x, z: point.z - ring.z });
  const deck = from({ x: 60, z: 114 });

  it('turns the jib over the point, raises it within 10° to 45°, and stops the hook 7,4 m up', () => {
    const to = craneToward(rig, deck)!;
    // The head's way, about up from −x, points at the deck; the jib's foot to its head reaches it.
    expect(Math.atan2(deck.z, -deck.x)).toBeCloseTo(to.slew, 9);
    const angle = rest + to.lift;
    expect(angle / DEG).toBeGreaterThanOrEqual(10);
    expect(angle / DEG).toBeLessThanOrEqual(45);
    expect(-rig.foot[0] + jib * Math.cos(angle)).toBeCloseTo(Math.hypot(deck.x, deck.z), 9);
    expect(to.head[1] - to.cable + rig.height).toBeCloseTo(7.4, 9);
  });

  it('keeps its loop out of reach: a hull at its side (37 m), in the roads, or too near', () => {
    expect(craneToward(rig, from({ x: 41, z: 114 }))).toBeNull();
    expect(craneToward(rig, from({ x: 41, z: 400 }))).toBeNull();
    expect(craneToward(rig, { x: 5, z: 5 })).toBeNull();
  });

  it('turns every part of the loop by the same pose as the loop does', () => {
    const state = craneAt(13, rig);
    expect(craneParts(rig, state).grue_couronne.turn[1]).toBe(state.slew);
    expect(craneParts(rig, craneAt(0, rig)).cable.stretch).toBe(1);
  });

  describe('a visit', () => {
    const to = craneToward(rig, deck)!;
    const loop = craneAt(13, rig);
    const visit = craneVisit(rig, loop, to, 1);

    it('leaves the crane where the loop had it until the jib turns, then comes over the hull', () => {
      expect(visit.at(0)).toEqual(loop);
      const over = visit.at(2900);
      expect([over.slew, over.lift]).toEqual([to.slew, to.lift]);
      expect(over.cable).toBeCloseTo(rig.cable, 9);
    });

    it('lowers the hook to the deck, holds, hoists, and goes back to rest — the loop at 0', () => {
      expect(visit.at(3900).cable).toBeCloseTo(to.cable, 9);
      expect(visit.at(6400).cable).toBeCloseTo(to.cable, 9);
      for (const key of ['slew', 'lift', 'cable'] as const)
        expect(visit.at(visit.ms)[key]).toBeCloseTo(craneAt(0, rig)[key], 9);
      expect(visit.at(visit.ms + 5000)).toEqual(visit.at(visit.ms));
    });

    it('moves without a leap, frame to frame', () => {
      let last = visit.at(0);
      for (let t = 16; t <= visit.ms; t += 16) {
        const now = visit.at(t);
        expect(Math.abs(now.slew - last.slew)).toBeLessThan(0.05);
        expect(Math.abs(now.lift - last.lift)).toBeLessThan(0.05);
        expect(Math.abs(now.cable - last.cable)).toBeLessThan(0.5);
        last = now;
      }
    });
  });
});
