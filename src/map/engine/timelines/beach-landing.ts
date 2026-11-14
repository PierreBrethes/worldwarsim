import { Box3, type Matrix4, type Object3D, Vector3 } from 'three';
import type { MapMotion } from '@/domain/map-motion';
import type { Assault } from './beach-boats';

/** **The canots play from 30 px**, as the tailgate does: a cargo's pile reads small at the zoom
 *  a player keeps on a coast. `@a-mesurer` — to measure on a phone */
export const LANDING_PX = 30;
/** How far in front of its men a boat grounds, in metres of the model: its bow, 3.2 m ahead of
 *  its centre, leaves a few paces of sand to them. `@a-mesurer` */
const SETBACK_M = 6;
/** The stern's water is cleared by this many metres: half a boat's length and a little more. */
const ASTERN_CLEAR_M = 4.5;

/**
 * **Whether a cargo's debarkation plays its boats**: `'play'` for a cargo before a beach, in the
 * field and near enough, at full motion and not under a combat; `null` where the pile stands at
 * once. A quay is `boardingVerdict`'s (#512), a carrier or a plane has no sequence at all.
 */
export function landingVerdict(hull: {
  readonly role: string;
  readonly ground: 'quay' | 'beach';
  readonly motion: MapMotion;
  readonly veiled: boolean;
  readonly big: boolean;
}): 'play' | null {
  return hull.role === 'cargo' &&
    hull.ground === 'beach' &&
    hull.motion === 'full' &&
    !hull.veiled &&
    hull.big
    ? 'play'
    : null;
}

/**
 * **The boats a cargo file hangs** (`boat_left`, `boat_right`, the junk has the first only) where
 * the rig finds them, and the z of its stern in the file's own metres, cleared of the water the
 * boat runs in. A file with no boat has `boats: []`.
 */
export function boatsOfScene(scene: Object3D): {
  readonly boats: Assault['boats'];
  readonly astern: number;
} {
  scene.updateMatrixWorld(true);
  const boats = (['boat_left', 'boat_right'] as const).flatMap((node) => {
    const found = scene.getObjectByName(node);
    if (found === undefined) return [];
    const at = found.getWorldPosition(new Vector3());
    return [{ node, rest: [at.x, at.y, at.z] as const }];
  });
  return { boats, astern: new Box3().setFromObject(scene).min.z - ASTERN_CLEAR_M };
}

/**
 * **A cargo's assault, read off the board** (#509): `frame` takes a point of the hull's file to
 * the board (`StandingLayer.frameOf`), `boats` and `astern` are the file's (`boatsOfScene`), and
 * each squad is where the pile has drawn it (`placeOf`). A boat grounds `SETBACK_M` short of its
 * squad's centre, on the line to the hull. `null` when there is no boat to put out or no squad to
 * carry: the pile is posed at once.
 */
export function assaultOf({
  frame,
  boats,
  astern,
  squads,
  man,
  wet,
}: {
  readonly frame: Matrix4;
  readonly boats: Assault['boats'];
  readonly astern: number;
  readonly squads: ReadonlyArray<{ readonly men: ReadonlyArray<Vector3>; readonly front: Vector3 }>;
  readonly man: number;
  /** Whether a board point is water: the boat grounds where the line from the hull first leaves it. */
  readonly wet?: (x: number, z: number) => boolean;
}): Assault | null {
  const squadsWithMen = squads.filter(({ men }) => men.length > 0);
  if (boats.length === 0 || squadsWithMen.length === 0) return null;
  const metre = new Vector3().setFromMatrixScale(frame).x;
  const at = new Vector3().applyMatrix4(frame);
  const bow = new Vector3(0, 0, 1).transformDirection(frame);
  return {
    hull: { at: [at.x, at.z], heading: Math.atan2(bow.x, bow.z), metre, astern },
    boats,
    squads: squadsWithMen.map(({ men, front }) => {
      const centre = men.reduce((sum, m) => sum.add(m), new Vector3()).divideScalar(men.length);
      const toward = new Vector3(at.x - centre.x, 0, at.z - centre.z);
      // Never past half the way to the hull: a pile packed tight still has its boat short of it.
      const length = toward.length();
      toward.normalize();
      let back = Math.min(SETBACK_M * metre, length / 2);
      // A squad inland of the water edge is fetched from the edge: a boat does not cross sand.
      if (wet !== undefined)
        for (let d = back; d < length; d += metre)
          if (wet(centre.x + toward.x * d, centre.z + toward.z * d)) {
            back = d;
            break;
          }
      const landing = centre.addScaledVector(toward, back);
      return {
        men: men.map((m) => [m.x, m.z] as const),
        heading: Math.atan2(front.x, front.z),
        landing: [landing.x, landing.z] as const,
      };
    }),
    man,
  };
}
