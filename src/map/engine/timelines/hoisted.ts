import { Matrix4, Vector3 } from 'three';
import { MOLE } from '@/emblems/kits/manifest';
import { ease, span } from './curves';
import {
  type Boom,
  DRIVE_LENGTHS,
  hoistsOf,
  type Lift,
  SPOT_ONTO_DECK,
  type Stroke,
  strokesAt,
} from './derrick';
import { measured, type P3, vehicleWay } from './gangway';
import type { PartPose, Sequence } from '../sequences';

/**
 * **A vehicle lifted aboard a cargo** (#505): it drives its `path` on the board (the first point
 * its rest) from `driveStart` to `arrive` (ms), waits under the mast's tip, is hoisted as `lift`
 * says — `toBoard` takes a point of the hull to the board — turning with the mast (`swing`: the
 * board's heading of a heading of the hull), and is gone, faded across the coaming, once
 * lowered. Pure of the clock.
 */
export function hoistedOf({
  path,
  driveStart,
  arrive,
  lift,
  toBoard,
  swing,
}: {
  readonly path: ReadonlyArray<P3>;
  readonly driveStart: number;
  readonly arrive: number;
  readonly lift: Lift;
  readonly toBoard: (point: P3) => P3;
  readonly swing: (yaw: number) => number;
}): Sequence<never> {
  const { length, at: along } = measured(path);
  const rest = path[0]!;
  const ms = lift.dropped + 1;
  const moved = (to: P3): [number, number, number] => [
    to[0] - rest[0],
    to[1] - rest[1],
    to[2] - rest[2],
  ];
  const end = along(length);
  const slung = swing(lift.at(lift.lifted).yaw);
  return {
    ms,
    anywhere: true,
    pool: 'boarding',
    at(t) {
      if (t < 0 || t >= ms) return {};
      if (t < driveStart) return {};
      let pose: PartPose;
      if (t < arrive) {
        const there = along(ease.drive(span(t, driveStart, arrive)) * length);
        pose = { travel: moved(there.at), heading: there.heading };
      } else if (t < lift.lifted) {
        pose = { travel: moved(end.at), heading: end.heading };
      } else {
        const { load, yaw, fade } = lift.at(t);
        pose = {
          travel: moved(load === null ? end.at : toBoard(load)),
          heading: end.heading + swing(yaw) - slung,
          fade,
        };
      }
      return { root: pose };
    },
  };
}

/** One vehicle of a boarding: where it last stood on the board, and its length and height there. */
export type Vehicle = {
  readonly id: string;
  readonly rest: Vector3;
  readonly length: number;
  readonly height: number;
};

/**
 * **What a cargo's boarding plays for its vehicles** (#505): each takes a mast, drives from its
 * rest to the spot under the tip, and is hoisted (`hoistsOf`, `hoistedOf`). `frame` takes a
 * point of the hull's file to the board; `toModel` and `toBoard` are the port's, a port laid in
 * mirror included, and `deck` the mole's height in its metres. Rend les séquences à jouer
 * (chaque véhicule, puis la coque et ses mâts), l'instant où chacun est rangé (`feeds`), le
 * moment où tout l'est (`settled`, ms) et les traits des câbles à l'instant `t` ; rien quand le
 * fichier n'a pas de mât ou qu'il n'y a pas de véhicule : ils sont posés d'un coup.
 */
export function hoistedBoarding({
  booms,
  frame,
  toModel,
  toBoard: toBoardOf,
  deck,
  vehicles,
}: {
  readonly booms: ReadonlyArray<Boom>;
  readonly frame: Matrix4;
  readonly toModel: (board: Vector3) => Vector3;
  readonly toBoard: (model: Vector3) => Vector3;
  readonly deck: number;
  readonly vehicles: ReadonlyArray<Vehicle>;
}): {
  readonly playing: ReadonlyArray<{ readonly id: string; readonly sequence: Sequence<never> }>;
  readonly hull: Sequence<'cargo'> | null;
  readonly lifts: ReadonlyArray<{
    readonly boom: number;
    readonly arrive: number;
    readonly lift: Lift;
  }>;
  readonly feeds: ReadonlyArray<{ readonly at: number; readonly id: string }>;
  readonly settled: number;
  readonly strokes: (t: number) => Array<{ a: Vector3; b: Vector3; thick: boolean }>;
  readonly metre: number;
} {
  const metre = new Vector3().setFromMatrixScale(frame).x;
  if (booms.length === 0 || vehicles.length === 0)
    return { playing: [], hull: null, lifts: [], feeds: [], settled: 0, strokes: () => [], metre };
  const toBoard = (p: P3): P3 => {
    const v = new Vector3(...p).applyMatrix4(frame);
    return [v.x, v.y, v.z];
  };
  const toHull = new Matrix4().copy(frame).invert();
  const spots = booms.map((boom) => {
    const z = toModel(new Vector3(...toBoard(boom.pivot))).z;
    const port = [MOLE.inner + SPOT_ONTO_DECK, deck, z] as const;
    const at = toBoardOf(new Vector3(...port)).applyMatrix4(toHull);
    return { port, ground: [at.x, at.y, boom.pivot[2]] as P3 };
  });
  const ways = new Map<string, P3[]>();
  const wayOf = (vehicle: Vehicle, k: number): P3[] => {
    const key = `${vehicle.id} ${k}`;
    let way = ways.get(key);
    if (way === undefined) {
      const { rest } = vehicle;
      const [x, y, z] = spots[k]!.port;
      way = [
        [rest.x, rest.y, rest.z],
        ...vehicleWay(toModel(rest), { x, y, z }).map((at) => {
          const point = toBoardOf(new Vector3(...at));
          return [point.x, point.y, point.z] as P3;
        }),
      ];
      ways.set(key, way);
    }
    return way;
  };
  const lifts = hoistsOf({
    booms,
    grounds: spots.map(({ ground }) => ground),
    vehicles: vehicles.map((vehicle) => ({
      drive: (k: number) =>
        measured(wayOf(vehicle, k)).length / ((vehicle.length * DRIVE_LENGTHS) / 1000),
      height: vehicle.height / metre,
    })),
  });
  const swing = (yaw: number): number => {
    const [a, b] = [toBoard([0, 0, 0]), toBoard([Math.sin(yaw), 0, Math.cos(yaw)])];
    return Math.atan2(b[0] - a[0], b[2] - a[2]);
  };
  return {
    playing: vehicles.map((vehicle, n) => {
      const { boom, driveStart, arrive, lift } = lifts.lifts[n]!;
      return {
        id: vehicle.id,
        sequence: hoistedOf({
          path: wayOf(vehicle, boom),
          driveStart,
          arrive,
          lift,
          toBoard,
          swing,
        }),
      };
    }),
    hull: lifts.hull,
    lifts: lifts.lifts,
    feeds: vehicles.map(({ id }, n) => ({ at: lifts.lifts[n]!.lift.dropped, id })),
    settled: lifts.settled + 1,
    strokes: (t) =>
      lifts.lifts.flatMap(({ boom, lift }) =>
        strokesAt(booms[boom]!, lift, t).map(({ a, b, thick }: Stroke) => ({
          a: new Vector3(...toBoard(a)),
          b: new Vector3(...toBoard(b)),
          thick,
        })),
      ),
    metre,
  };
}
