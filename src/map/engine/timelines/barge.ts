import { Matrix4, Vector3 } from 'three';
import { LANDING_CRAFT } from '@/emblems/kits/manifest';
import { ease, span } from './curves';
import {
  BOOM,
  type Boom,
  DRIVE_LENGTHS,
  type Lift,
  liftOf,
  OPEN,
  SINK,
  type Stroke,
  strokesAt,
} from './derrick';
import { measured, type P3 } from './gangway';
import type { Flat } from './beach-boats';
import type { PartPose, Pose, Sequence } from '../sequences';

/** The storyboard's hours, in ms (« 4. L'assaut en canots », the barge): no mast starts before
 *  the hull's copy stands; the barge sails off a beat after the tank is in it; its ramp falls in
 *  `ramp`; it backs away a beat after the tank is off. `@a-mesurer` */
const START = 600;
const ABOARD = 400;
const RAMP_MS = 500;
const CLEAR = 300;
/** Its pace on the water, in metres of the hull a second, and the share of the time it comes home
 *  in (it is light). `@a-mesurer` */
const BARGE_MPS = 9;
const BACK_SHARE = 0.7;
/** The vehicle turns to its rank's heading over the end of its drive (ms). `@a-mesurer` */
const TURN_HOME_MS = 600;
/** The keel on the water, in the hull's metres (the boats' own). */
const WATER_Y = -0.25;
/** The barge floats this far off the hull's flank, in hull metres. `@a-mesurer` */
const OFFING = 0.3;

const angleBetween = (from: number, to: number, k: number): number =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;

/**
 * **Lays the poses of two sequences of one hull side by side**: the boats' and the masts'. A hull
 * plays one sequence (#510), so what two plans move of it is one.
 */
export function merged(
  a: Sequence<'cargo'> | null,
  b: Sequence<'cargo'> | null,
): Sequence<'cargo'> | null {
  if (a === null || b === null) return a ?? b;
  return { ...a, ms: Math.max(a.ms, b.ms), at: (t) => ({ ...a.at(t), ...b.at(t) }) };
}

/**
 * **Where the barge grounds**, on the board: the water's edge on the line from the vehicle's rest
 * to the hull (the frame's origin), as a squad's boat does; short of the hull when the water is
 * nearer than a boat's length. `wet` says whether a board point is water.
 */
export function bargeGroundOf({
  frame,
  rest,
  wet,
}: {
  readonly frame: Matrix4;
  readonly rest: Vector3;
  readonly wet?: (x: number, z: number) => boolean;
}): Flat {
  const metre = new Vector3().setFromMatrixScale(frame).x;
  const hull = new Vector3().applyMatrix4(frame);
  const toward = new Vector3(hull.x - rest.x, 0, hull.z - rest.z);
  const length = toward.length();
  toward.normalize();
  let back = Math.min(6 * metre, length / 2);
  if (wet !== undefined)
    for (let d = back; d < length; d += metre)
      if (wet(rest.x + toward.x * d, rest.z + toward.z * d)) {
        back = d;
        break;
      }
  return [rest.x + toward.x * back, rest.z + toward.z * back];
}

/** What the engine draws of the barge at an instant: its keel's middle on the board, the way it
 *  faces, and its ramp, 0 raised to 1 fallen. */
export type Craft = { readonly at: Vector3; readonly heading: number; readonly ramp: number };

export type BargePlan = {
  /** The masts and the holds' hatches, to merge with the hull's other poses. */
  readonly hull: Sequence<'cargo'>;
  /** The vehicle: out of its hold, onto the barge, ashore and home. */
  readonly tank: Sequence<never>;
  readonly craft: (t: number) => Craft | null;
  readonly strokes: (t: number) => Array<{ a: Vector3; b: Vector3; thick: boolean }>;
  /** The craft's size in board units, the deck's height over the keel among them. */
  readonly size: {
    readonly length: number;
    readonly width: number;
    readonly depth: number;
    readonly floor: number;
    readonly ramp: number;
  };
  /** The whole is put away at this instant (ms). */
  readonly ms: number;
  readonly metre: number;
};

/**
 * **The barge that carries the first vehicle ashore** (#511, storyboard `mer-air` « 4. L'assaut en
 * canots »): the mast of the hold nearest the stern takes the barge off its hatch and sets it on
 * the water beside the hull, on the shore's side; a mast takes the vehicle out of its hold and
 * lowers it into the barge, which sails to `ground` (the water's edge, on the board), grounds,
 * drops its ramp, lets the vehicle drive to its rest, backs away and is hoisted home. `frame` takes
 * the hull's file to the board and `beam` is its half width. `null` for a file without a mast.
 */
export function bargeOf({
  booms,
  frame,
  beam,
  vehicle,
  ground,
}: {
  readonly booms: ReadonlyArray<Boom>;
  readonly frame: Matrix4;
  readonly beam: number;
  readonly vehicle: {
    readonly rest: Vector3;
    readonly heading: number;
    readonly length: number;
    readonly height: number;
  };
  readonly ground: Flat;
}): BargePlan | null {
  const byStern = [...booms].sort((a, b) => a.hatch.at[2] - b.hatch.at[2]);
  const carrier = byStern[0];
  if (carrier === undefined) return null;
  // The mast of the next hold lowers the vehicle; a file with one mast does both in turn.
  const lowers = byStern[1] ?? carrier;
  const metre = new Vector3().setFromMatrixScale(frame).x;
  const unit = carrier.length / BOOM;
  const [length, width, depth, floor, ramp] = [
    LANDING_CRAFT.length,
    LANDING_CRAFT.width,
    LANDING_CRAFT.depth,
    LANDING_CRAFT.floor,
    LANDING_CRAFT.ramp,
  ].map((v) => v * unit) as [number, number, number, number, number];

  const inverse = new Matrix4().copy(frame).invert();
  const toBoard = (p: P3): Vector3 => new Vector3(...p).applyMatrix4(frame);
  const toHull = (v: Vector3): Vector3 => v.clone().applyMatrix4(inverse);
  const headingOnBoard = (yaw: number): number => {
    const [a, b] = [toBoard([0, 0, 0]), toBoard([Math.sin(yaw), 0, Math.cos(yaw)])];
    return Math.atan2(b.x - a.x, b.z - a.z);
  };

  const edge = toHull(new Vector3(ground[0], vehicle.rest.y, ground[1]));
  const shore = Math.sign(edge.x) || 1;
  const water: P3 = [shore * (beam + width / 2 + OFFING * unit), WATER_Y, carrier.pivot[2]];
  const toEdge = new Vector3(edge.x - water[0], 0, edge.z - water[2]);
  const reach = toEdge.length();
  toEdge.normalize();
  // It sails bow first, the ramp toward the sand, and grounds with its bow at the edge.
  const yaw = Math.atan2(toEdge.x, toEdge.z);
  const aground: P3 = (() => {
    const run = Math.max(0, reach - length / 2);
    return [water[0] + toEdge.x * run, WATER_Y, water[2] + toEdge.z * run];
  })();
  const run = Math.max(
    1,
    (Math.hypot(aground[0] - water[0], aground[2] - water[2]) / BARGE_MPS) * 1000,
  );

  const cale: P3 = [carrier.hatch.at[0], carrier.hatch.rim, carrier.hatch.at[2]];
  // The barge is the load: it comes down to the water as a load comes down to a hold's rim.
  const onWater = (boom: Boom): Boom => ({
    ...boom,
    hatch: { at: water, rim: WATER_Y + SINK + depth },
  });
  const [out0, out] = [0, START].map((start) =>
    liftOf({ boom: onWater(carrier), spot: cale, height: depth, start }),
  ) as [Lift, Lift];
  const vehicleHeight = vehicle.height / metre;
  const deck: P3 = [water[0], WATER_Y + floor, water[2]];
  const lowering = liftOf({ boom: lowers, spot: deck, height: vehicleHeight, start: 0 });

  const sameMast = lowers.n === carrier.n;
  const lowerMs = lowering.end;
  const startLower = Math.max(
    out.dropped + CLEAR - (lowerMs - lowering.lifted),
    sameMast ? out.end : START,
  );
  const inBarge = startLower + lowerMs - lowering.lifted;
  const sail = inBarge + ABOARD;
  const beached = sail + run;
  const ashore = beached + RAMP_MS;

  const hereHeading = headingOnBoard(yaw);
  const craftAtGround = toBoard(aground);
  const bow = toBoard([
    aground[0] + toEdge.x * (length / 2 + ramp * Math.sin(LANDING_CRAFT.down)),
    0,
    aground[2] + toEdge.z * (length / 2 + ramp * Math.sin(LANDING_CRAFT.down)),
  ]);
  const way: P3[] = [
    [craftAtGround.x, toBoard([0, deck[1], 0]).y, craftAtGround.z],
    [bow.x, vehicle.rest.y, bow.z],
    [vehicle.rest.x, vehicle.rest.y, vehicle.rest.z],
  ];
  const driven = measured(way);
  const driveMs = (driven.length / ((vehicle.length * DRIVE_LENGTHS) / 1000)) | 0;
  const offEnd = ashore + driveMs;
  const leave = offEnd + CLEAR;
  const back = leave + run * BACK_SHARE;
  const backLift = out0.end - out0.dropped;
  const startBack = Math.max(back - backLift, sameMast ? startLower + lowerMs : START);
  const riseAt = startBack + backLift;
  const end = startBack + out0.end;

  /** The barge of a lift, in the hull's metres: where its keel is and which way it faces. */
  const carried = (lift: Lift, t: number): { at: P3; yaw: number } => {
    const { load } = lift.at(t);
    return {
      at: t < lift.lifted ? cale : t >= lift.dropped ? water : (load as P3),
      yaw: angleBetween(0, yaw, ease.inOut(span(t, lift.lifted, lift.over))),
    };
  };
  const along = (k: number): P3 => [
    water[0] + (aground[0] - water[0]) * k,
    WATER_Y,
    water[2] + (aground[2] - water[2]) * k,
  ];
  const state = (t: number): { at: P3; yaw: number; ramp: number } => {
    if (t < out.dropped) return { ...carried(out, t), ramp: 0 };
    if (t < sail) return { at: water, yaw, ramp: 0 };
    if (t < beached) return { at: along(ease.drive(span(t, sail, beached))), yaw, ramp: 0 };
    if (t < leave) return { at: aground, yaw, ramp: ease.out3(span(t, beached, ashore)) };
    if (t < back)
      return {
        at: along(1 - ease.drive(span(t, leave, back))),
        yaw,
        ramp: 1 - ease.in2(span(t, leave, leave + RAMP_MS)),
      };
    if (t < riseAt) return { at: water, yaw, ramp: 0 };
    return { ...carried(out0, out0.end - (t - startBack)), ramp: 0 };
  };

  const craft = (t: number): Craft | null => {
    if (t < 0 || t >= end) return null;
    const { at, yaw: facing, ramp: fall } = state(t);
    return { at: toBoard(at), heading: headingOnBoard(facing), ramp: fall };
  };

  const slungYaw = headingOnBoard(lowering.at(lowering.lifted).yaw);
  const tank: Sequence<never> = {
    ms: offEnd + 1,
    anywhere: true,
    pool: 'boarding',
    at(t) {
      if (t < 0 || t > offEnd) return {};
      const moved = (to: Vector3): [number, number, number] => [
        to.x - vehicle.rest.x,
        to.y - vehicle.rest.y,
        to.z - vehicle.rest.z,
      ];
      const back = lowerMs - (t - startLower);
      let pose: PartPose;
      if (back >= lowering.dropped) pose = { fade: 0 };
      else if (back >= lowering.lifted) {
        const { load, yaw: mast, fade } = lowering.at(back);
        pose = {
          travel: moved(toBoard(load ?? deck)),
          heading: hereHeading + headingOnBoard(mast) - slungYaw,
          fade,
        };
      } else if (t < ashore) {
        const { at } = state(t);
        pose = { travel: moved(toBoard([at[0], at[1] + floor, at[2]])), heading: hereHeading };
      } else {
        const there = driven.at(ease.drive(span(t, ashore, offEnd)) * driven.length);
        const to = Math.atan2(
          Math.sin(vehicle.heading - there.heading),
          Math.cos(vehicle.heading - there.heading),
        );
        pose = {
          travel: moved(new Vector3(...there.at)),
          heading: there.heading + to * ease.inOut(span(t, offEnd - TURN_HOME_MS, offEnd)),
        };
      }
      return { root: pose };
    },
  };

  const windows = [
    { boom: carrier, lift: out, at: (t: number) => t, hatch: false },
    { boom: lowers, lift: lowering, at: (t: number) => lowerMs - (t - startLower), hatch: true },
    { boom: carrier, lift: out0, at: (t: number) => out0.end - (t - startBack), hatch: false },
  ];
  const starts = [out.start, startLower, startBack];
  const ends = [out.end, startLower + lowerMs, end];
  const hull: Sequence<'cargo'> = {
    family: 'cargo',
    pool: 'site',
    anywhere: true,
    ms: end + 1,
    at(t) {
      const pose: Record<string, PartPose> = {};
      if (t < 0 || t > end) return {};
      windows.forEach(({ boom, lift, at, hatch }, k) => {
        if (t < starts[k]! || t >= ends[k]!) return;
        const { yaw: aim, lift: up } = lift.at(at(t));
        pose[`mat_charge_${boom.n}`] = { aim: [aim, up] };
        if (hatch) pose[`hold_hatch_${boom.n}`] = { turn: [0, 0, -OPEN * lift.hatchAt(at(t))] };
      });
      return pose as Pose<'cargo'>;
    },
  };

  return {
    hull,
    tank,
    craft,
    strokes: (t) =>
      windows.flatMap(({ boom, lift, at }, k) =>
        t < starts[k]! || t >= ends[k]!
          ? []
          : strokesAt(boom, lift, at(t)).map(({ a, b, thick }: Stroke) => ({
              a: toBoard(a),
              b: toBoard(b),
              thick,
            })),
      ),
    size: {
      length: length * metre,
      width: width * metre,
      depth: depth * metre,
      floor: floor * metre,
      ramp: ramp * metre,
    },
    ms: end,
    metre,
  };
}
