import { Vector3 } from 'three';
import type { UnitRole } from '@/domain/ids';
import type { RigFamily } from '@/emblems/rigs';
import type { PartPose, Pose, Sequence } from './sequences';
import {
  AIR,
  type AirRole,
  doorCourse,
  hangarOf,
  laneOf,
  type Spot,
  type Track,
} from './timelines/airfield';
import type { HullTrack, SeaRole } from './timelines/port';

/** A site's frame on the board (`MaquetteLayer.siteOf`). */
type Frame = { toBoard(point: Vector3): Vector3; toModel(point: Vector3): Vector3 };

export const isAirRole = (role: UnitRole): role is AirRole => role in AIR;
export const isSeaRole = (role: UnitRole): role is SeaRole =>
  role === 'cargo' || role === 'escort' || role === 'carrier';

/** **A piece at rest on the board, in its site's metres**: where it stands and its heading. */
export function spotOf(site: Frame, at: Vector3, front: Vector3): Spot & { yaw: number } {
  const here = site.toModel(at);
  const ahead = site.toModel(at.clone().add(front)).sub(here);
  return { x: here.x, z: here.z, yaw: Math.atan2(ahead.x, ahead.z) };
}

/** **The gear folds** (`gear`, 0 down, 1 up): in toward the belly for a fighter, back for the
 *  others (storyboard). Axes and course `@a-mesurer` until the models are read for it. */
function gearPose(role: AirRole, gear: number): Record<string, PartPose> {
  if (gear <= 0) return {};
  const fold = (Math.PI / 2) * gear;
  return AIR[role].fold === 'in'
    ? {
        gear_left: { turn: [0, 0, fold] },
        gear_right: { turn: [0, 0, -fold] },
        tailwheel: { turn: [-fold, 0, 0] },
      }
    : {
        gear_left: { turn: [-fold, 0, 0] },
        gear_right: { turn: [-fold, 0, 0] },
        tailwheel: { turn: [-fold, 0, 0] },
      };
}

/**
 * **A track in the site's metres played on a piece standing at `rest`** (#269, #270): its root
 * travels on the board, heads and pitches as the track says; a plane folds its gear. `fade`, 0 to
 * 1, how much of it stands (a hull dressing on its slip).
 */
export function trackSequence(
  site: Frame,
  track: Track | HullTrack,
  rest: Vector3,
  role: UnitRole,
  articulated: boolean,
  fade?: (ms: number) => number,
): Sequence {
  const air = isAirRole(role) ? role : null;
  const family = articulated && air !== null ? (air as RigFamily) : undefined;
  return {
    ...(family === undefined ? {} : { family }),
    ms: track.ms,
    at(t): Pose<RigFamily> {
      const q = track.at(t);
      const at = site.toBoard(new Vector3(q.x, q.y, q.z));
      const ahead = site
        .toBoard(new Vector3(q.x + Math.sin(q.yaw), q.y, q.z + Math.cos(q.yaw)))
        .sub(at);
      const root: PartPose = {
        travel: at.clone().sub(rest).toArray(),
        heading: Math.atan2(ahead.x, ahead.z),
        pitch: q.pitch,
        ...(fade === undefined ? {} : { fade: fade(t) }),
      };
      const gear =
        air !== null && family !== undefined && 'gear' in q ? gearPose(air, q.gear as number) : {};
      return { root, ...gear } as Pose<RigFamily>;
    },
  };
}

/** **The airfield while a plane moves on it** (#269): its runway lit by night (the copy's own
 *  lamps, `MaquetteLayer.standIn`), and the doors of the hangar a new plane comes out of. */
export function airfieldSequence(
  ms: number,
  doors?: { readonly lane: number; open(ms: number): number },
): Sequence<'airfield'> {
  const suffix = doors === undefined ? null : hangarOf(laneOf(doors.lane));
  return {
    family: 'airfield',
    ms,
    at(t) {
      if (doors === undefined || suffix === null) return {};
      const { inner, outer } = doorCourse(doors.open(t));
      // The left leaves run to +x, the right to -x (storyboard).
      const by = (x: number): PartPose => ({ shift: [x, 0, 0] });
      return {
        [`porte_gauche_1${suffix}`]: by(inner),
        [`porte_gauche_2${suffix}`]: by(outer),
        [`porte_droite_1${suffix}`]: by(-inner),
        [`porte_droite_2${suffix}`]: by(-outer),
      } as Pose<'airfield'>;
    },
  };
}

/** The six shores of the slip, by name. */
const SHORES = [1, 2, 3, 4, 5, 6] as const;
/** How far a shore tips over as it falls. */
const SHORE_FALL = (77 * Math.PI) / 180;

/** **The port while a hull is launched** (#270): the hull on its slip gives way to the one
 *  produced, its shores fall outward one after another. */
export function slipSequence(
  ms: number,
  dressed: (ms: number) => number,
  shores: (ms: number, k: number) => number,
): Sequence<'port'> {
  return {
    family: 'port',
    ms,
    at(t) {
      const pose: Record<string, PartPose> = { coque_cale: { fade: 1 - dressed(t) } };
      // The first three stand on -x, the others on +x: each falls away from the hull.
      for (const k of SHORES)
        pose[`accore_${k}`] = { turn: [0, 0, (k <= 3 ? 1 : -1) * SHORE_FALL * shores(t, k - 1)] };
      return pose as Pose<'port'>;
    },
  };
}
