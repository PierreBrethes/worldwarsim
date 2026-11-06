import { AIRFIELD } from '@/emblems/kits/manifest';
import { ease, span } from './curves';

/**
 * **A plane at an airfield, a pure function of time** (#269, `storyboard-aerodrome/commun/
 * aerodrome.js`, passe B+ du 03/11): in `airfield.glb`'s metres, +z toward the runway, its
 * heading `yaw` from +z, its nose `pitch` up from its rest on its wheels, its gear folded by
 * `gear` (0 down, 1 up). Times in milliseconds.
 */
type Plane = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly gear: number;
};
export type Track = { readonly ms: number; at(t: number): Plane };
export type AirRole = 'fighter' | 'bomber' | 'airTransport';

/** The storyboard's speeds (m/s played on screen) and lengths (m), the gear folding in or back. */
export const AIR: Readonly<
  Record<AirRole, { roll: number; vLift: number; taxi: number; fold: 'in' | 'back' }>
> = {
  fighter: { roll: 40, vLift: 40, taxi: 14, fold: 'in' },
  bomber: { roll: 54, vLift: 44, taxi: 11, fold: 'back' },
  airTransport: { roll: 60, vLift: 42, taxi: 10, fold: 'back' },
};

/** **Its thread's height** (`AIR_ALTITUDE`, three fighter spans), in metres. */
export const ALT = 33;
const DEG = Math.PI / 180;
/** Where it stands at rest, in the model's metres, and its heading there (0: nose to the runway). */
export type Spot = { readonly x: number; readonly z: number; readonly yaw?: number };
/** The turn from `from` to `to` the shortest way. */
const toward = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** The taxi's quarter turn onto the runway. */
const TURN_R = 12;
/** How far its tail stands from the hangar's rail, parked (storyboard, question 1). */
export const TAIL_GAP = 2;
/** Seconds: the motor starts, it holds on the runway, its thread takes it, its U-turn. */
const T = { lead: 0.6, hold: 0.45, fil: 1.2, uturn: 2.4, doors: 1.4, born: 0.6, bounce: 0.5 };
/** Its thread's speed, m/s: where it slows to after its climb. */
const FIL_SPEED = 3;
/** **Nose up on its tail wheel, at rest**, lifted level at the roll. `@a-mesurer` (10 to 11°
 *  read on the models by the storyboard) */
const TAIL_DOWN = 10 * DEG;
/** **It bounces once on touching**, this high. `@a-mesurer` */
const BOUNCE = 1.2;

const { runway, ramp, top, facade, lanes } = AIRFIELD;
/** The hangars' lanes, right (`A`) then left (`B`): a plane leaving waits in the left one. */
export const AIRFIELD_LANES = lanes;
const x0 = runway.x1 - runway.length;
/** **Where its thread starts**, beyond the free end, at its height (#269). `@a-mesurer` */
export const FIL = { x: x0 - 90, y: ALT, z: runway.z } as const;
/** **Where its thread ends**, on the runway's axis beyond the free end, at its height. */
export const APPROACH = { x: x0 - 140, y: ALT, z: runway.z } as const;
/** It touches just past the threshold. */
const TOUCH = x0 + 15;

/** **The ground under a plane**: the socle's top, the ramp, the runway, the sheet. */
export function groundAt(x: number, z: number): number {
  if (z <= ramp.from) return top;
  if (z < ramp.to) return top * (1 - (z - ramp.from) / (ramp.to - ramp.from));
  return Math.abs(z - runway.z) <= runway.half && x >= x0 && x <= runway.x1 ? 0.1 : 0;
}

/** **The lane a plane parked at `x` rolls in**: the nearer hangar's. */
export const laneOf = (x: number): number =>
  Math.abs(x - lanes[0]) < Math.abs(x - lanes[1]) ? lanes[0] : lanes[1];

/** **Where a plane parks**, in its lane: its tail `tail` metres behind its wheels, 2 m off the
 *  rail, nose toward the runway. */
export const parkingZ = (tail: number): number => facade + TAIL_GAP + tail;

type Flat = readonly [x: number, z: number];

/** A path on the ground, walked by its length: its point and its heading. */
function polyline(points: ReadonlyArray<Flat>) {
  const legs = points.slice(1).map((b, k) => {
    const a = points[k]!;
    return { a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const length = legs.reduce((sum, leg) => sum + leg.length, 0);
  return {
    length,
    at(s: number): { x: number; z: number; yaw: number } {
      let rest = Math.min(Math.max(s, 0), length);
      for (const [k, { a, b, length: l }] of legs.entries()) {
        if (rest > l && k < legs.length - 1) {
          rest -= l;
          continue;
        }
        const f = l === 0 ? 1 : rest / l;
        return {
          x: a[0] + (b[0] - a[0]) * f,
          z: a[1] + (b[1] - a[1]) * f,
          yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
        };
      }
      return { x: points[0]![0], z: points[0]![1], yaw: 0 };
    },
  };
}

const arc = (cx: number, cz: number, from: number, to: number, n = 8): Flat[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = from + ((to - from) * k) / n;
    return [cx + TURN_R * Math.cos(a), cz + TURN_R * Math.sin(a)] as const;
  });

/** On the ground: its height, and its nose following the slope. */
const rolling = (p: { x: number; z: number; yaw: number }, gear = 0): Plane => {
  const y = groundAt(p.x, p.z);
  const ahead = groundAt(p.x + Math.sin(p.yaw) * 2, p.z + Math.cos(p.yaw) * 2);
  return { x: p.x, y, z: p.z, yaw: p.yaw, pitch: Math.atan2(ahead - y, 2), gear };
};

type Phase = { readonly until: number; at(τ: number, k: number): Plane };
/** Phases end to end, in seconds; beyond the last, its end. */
function track(phases: ReadonlyArray<Phase>): Track {
  const end = phases.at(-1)!.until;
  return {
    ms: end * 1000,
    at(ms) {
      const t = Math.min(Math.max(ms / 1000, 0), end);
      let from = 0;
      for (const { until, at } of phases) {
        if (t <= until) return at(t - from, until > from ? (t - from) / (until - from) : 1);
        from = until;
      }
      const last = phases.at(-1)!;
      return last.at(end - (phases.at(-2)?.until ?? 0), 1);
    },
  };
}

/**
 * **It takes off from where it waits on the yard** (storyboard « Décollage depuis la cour »): its
 * motor starts, it rolls down its lane, down the ramp, a quarter turn onto the runway toward its
 * free end, holds, rolls, lifts its tail then its nose, climbs folding its gear, and slows onto its
 * thread (`FIL`).
 */
export function takeoff(
  role: AirRole,
  from: { readonly x: number; readonly z: number },
): Track & { ready: number; leaves: number } {
  const a = AIR[role];
  const lane = laneOf(from.x);
  const way = polyline([
    [from.x, from.z],
    ...(Math.abs(from.x - lane) > 0.5 ? [[lane, from.z + 4] as const] : []),
    [lane, runway.z - TURN_R],
    ...arc(lane - TURN_R, runway.z - TURN_R, 0, Math.PI / 2).slice(1),
  ]);
  const taxi = (way.length / a.taxi) * 1.33;
  const roll = (2 * a.roll) / a.vLift;
  const acc = a.vLift / roll;
  const xs = lane - TURN_R;
  const xl = xs - a.roll;
  const fil = ((a.vLift + FIL_SPEED) / 2) * T.fil;
  const climb = (xl - (FIL.x + fil)) / a.vLift;
  const dec = (a.vLift - FIL_SPEED) / T.fil;
  const tTaxi = T.lead + taxi;
  const tRoll = tTaxi + T.hold;
  const tLift = tRoll + roll;
  const tClimb = tLift + climb;
  return {
    ready: tTaxi * 1000,
    leaves: tLift * 1000,
    ...track([
      { until: T.lead, at: () => rolling(way.at(0)) },
      { until: tTaxi, at: (_, k) => rolling(way.at(way.length * ease.drive(k))) },
      { until: tRoll, at: () => rolling(way.at(way.length)) },
      {
        until: tLift,
        at: (τ) => {
          const s = 0.5 * acc * τ * τ;
          const pitch =
            -TAIL_DOWN * ease.inOut(span(s, 0.3 * a.roll, 0.55 * a.roll)) +
            (TAIL_DOWN + 4 * DEG) * ease.inOut(span(s, 0.85 * a.roll, a.roll));
          return { x: xs - s, y: 0.1, z: runway.z, yaw: -Math.PI / 2, pitch, gear: 0 };
        },
      },
      {
        until: tClimb,
        at: (τ, k) => {
          const slope = ((ALT * Math.PI) / (2 * (xl - FIL.x - fil))) * Math.sin(Math.PI * k);
          return {
            x: xl - a.vLift * τ,
            y: 0.1 + ((ALT - 0.1) * (1 - Math.cos(Math.PI * k))) / 2,
            z: runway.z,
            yaw: -Math.PI / 2,
            pitch: 4 * DEG * (1 - k) + Math.atan(slope),
            gear: ease.inOut(span(τ, 0.3, 1.1)),
          };
        },
      },
      {
        until: tClimb + T.fil,
        at: (τ) => ({
          x: FIL.x + fil - (a.vLift * τ - 0.5 * dec * τ * τ),
          y: ALT,
          z: runway.z,
          yaw: -Math.PI / 2,
          pitch: 0,
          gear: 1,
        }),
      },
    ]),
  };
}

/**
 * **It lands and comes back to the yard** (storyboard « Atterrissage : retour à la cour », #269 :
 * « il se pose, rebondit et rentre »): from the end of its thread (`APPROACH`) it comes down the
 * axis, its gear out, touches past the threshold and bounces once, brakes to its lane, turns up
 * the ramp, rolls up its lane to its place, and turns about by the outside of the site, nose to
 * the runway.
 */
export function landing(role: AirRole, to: Spot): Track & { touch: number; clear: number } {
  const a = AIR[role];
  const lane = laneOf(to.x);
  const vA = a.vLift * 1.05;
  const approach = (TOUCH - APPROACH.x) / vA;
  const xTurn = lane - TURN_R;
  const brake = (2 * (xTurn - TOUCH)) / (vA + a.taxi);
  const br = (vA - a.taxi) / brake;
  const way = polyline([
    ...arc(lane - TURN_R, runway.z - TURN_R, Math.PI / 2, 0),
    [lane, to.z],
    ...(Math.abs(to.x - lane) > 0.5 ? [[to.x, to.z] as const] : []),
  ]);
  const taxi = (way.length / a.taxi) * 1.15;
  const tTouch = approach;
  const tTurn = tTouch + brake;
  const tPark = tTurn + taxi;
  // About by the outside of the site: away from the other lane.
  const side = lane > 0 ? -1 : 1;
  const rest = to.yaw ?? 0;
  const turn = ((((side * (rest - Math.PI)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * side;
  return {
    touch: tTouch * 1000,
    clear: tTurn * 1000,
    ...track([
      {
        until: tTouch,
        at: (τ, k) => ({
          x: APPROACH.x + vA * τ,
          y: 0.1 + (ALT - 0.1) * (1 - ease.inOut(k)),
          z: runway.z,
          yaw: Math.PI / 2,
          pitch: (-2 * DEG - TAIL_DOWN) * (1 - ease.inOut(span(k, 0.72, 1))),
          gear: 1 - ease.inOut(span(τ, 0, 0.9)),
        }),
      },
      {
        until: tTurn,
        at: (τ) => ({
          x: TOUCH + vA * τ - 0.5 * br * τ * τ,
          y: 0.1 + BOUNCE * Math.sin(Math.PI * span(τ, 0, T.bounce)),
          z: runway.z,
          yaw: Math.PI / 2,
          pitch: 0,
          gear: 0,
        }),
      },
      {
        until: tPark,
        at: (_, k) => rolling(way.at(way.length * (1 - (1 - k) ** 2 * (1 - 0.2 * k)))),
      },
      {
        until: tPark + T.uturn,
        at: (_, k) => rolling({ x: to.x, z: to.z, yaw: Math.PI + turn * ease.inOut(k) }),
      },
    ]),
  };
}

/** The hangar of a lane: `''` for the right one (`A`), `'_b'` for the left. */
export const hangarOf = (lane: number): '' | '_b' => (lane > 0 ? '_b' : '');

/**
 * **A new plane comes out of its hangar** (storyboard « Formation : le hangar s'ouvre »): the
 * doors part, it is born in the dark of the bay, rolls out to its place on the yard and the doors
 * close behind its tail. `doors` is how open, 0 to 1; `born` how much of it stands.
 */
export function formation(
  role: AirRole,
  to: Spot,
  tail: number,
): Track & { doors(ms: number): number; born(ms: number): number; closing: number } {
  const a = AIR[role];
  const lane = laneOf(to.x);
  const z0 = facade - 4.9;
  const out = ((to.z - z0) / a.taxi) * 1.4;
  const zAt = (t: number) => z0 + (to.z - z0) * ease.drive(span(t, T.doors, T.doors + out));
  let clear = T.doors + out;
  for (let t = T.doors; t <= T.doors + out; t += 0.02)
    if (zAt(t) - tail > facade + 1) {
      clear = t;
      break;
    }
  const end = Math.max(clear + T.doors, T.doors + out);
  // Clear of the doors, it rolls over to its own place and turns to its rest.
  const aside = (t: number) => ease.inOut(span(t, T.doors + out * 0.5, T.doors + out));
  const moved = track([
    {
      until: end,
      at: (τ) =>
        rolling({
          x: lane + (to.x - lane) * aside(τ),
          z: zAt(τ),
          yaw: toward(0, to.yaw ?? 0) * aside(τ),
        }),
    },
  ]);
  return {
    ...moved,
    doors: (ms) =>
      ease.inOut(span(ms / 1000, 0, T.doors)) *
      (1 - ease.inOut(span(ms / 1000, clear, clear + T.doors))),
    born: (ms) => span(ms / 1000, 0.8, 0.8 + T.born),
    closing: clear * 1000,
  };
}

/** **How far each pair of telescopic doors runs open** at `open` (0 to 1), in metres along x: the
 *  middle leaf alone, the outer one from half its course (storyboard). */
export const doorCourse = (open: number): { inner: number; outer: number } => {
  const inner = 16.3 * open;
  return { inner, outer: (Math.max(0, inner - 8.15) / 8.15) * 8.3 };
};
