import { Euler, Group, type Object3D, Quaternion, Vector3 } from 'three';
import { isRigPart, type RigFamily } from '@/emblems/rigs';
import type { RestPose } from './figurines/figurine';
import { markOf } from './figurines/marks';
import { articulatedOf, type PartPose, type Pose } from './sequences';
import { gearPose } from './site-ways';

const turn = new Quaternion();
const euler = new Euler();

/**
 * **The articulated copy of a transport in flight** (#507): its gear folded, its parts posed by
 * what a timeline says (`bay_door`, #481). Free of any figurine.
 */
export class FlightCopy {
  readonly copy = new Group();
  private readonly rests = new Map<Object3D, { position: Vector3; quaternion: Quaternion }>();

  constructor(rig: Object3D) {
    this.copy.add(rig);
    rig.traverse((node) => {
      if (!isRigPart('airTransport', node.name)) return;
      this.rests.set(node, {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
      });
    });
    this.pose({});
  }

  /** Every part from its rest, the gear up, then moved as `pose` says. */
  pose(pose: Pose<'airTransport'>): void {
    const gear = gearPose('airTransport', 1) as Record<string, PartPose>;
    const given = pose as Record<string, PartPose | undefined>;
    for (const [node, rest] of this.rests) {
      const own = given[node.name] ?? gear[node.name];
      node.position.copy(rest.position);
      node.quaternion.copy(rest.quaternion);
      if (own?.shift) node.position.add(new Vector3(...own.shift));
      if (own?.turn) node.quaternion.multiply(turn.setFromEuler(euler.set(...own.turn)));
    }
  }

  /** Where the crate leaves the plane, in map coordinates; `null` when the model has no
   *  `fx_parachute`. */
  release(into = new Vector3()): Vector3 | null {
    this.copy.updateWorldMatrix(true, true);
    return markOf(this.copy, 'fx_parachute', into);
  }
}

/** Cooks the copy of a transport at its rest pose, free of any figurine: the caller puts `copy`
 *  in the scene. `null` when the piece has no file. */
export async function lendFlightCopy(
  piece: { readonly url?: string; readonly pose?: RestPose },
  cook: (url: string, family: RigFamily, pose?: RestPose) => Promise<Group> = articulatedOf,
): Promise<FlightCopy | null> {
  if (piece.url === undefined) return null;
  return new FlightCopy((await cook(piece.url, 'airTransport', piece.pose)).clone(true));
}
