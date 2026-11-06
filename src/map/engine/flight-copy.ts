import { Group, type Object3D, type Quaternion, Vector3 } from 'three';
import { troopSpan } from '@/domain/piece-size';
import { isRigPart, type RigFamily } from '@/emblems/rigs';
import { measureOf, type RestPose } from './figurines/figurine';
import { markOf } from './figurines/marks';
import { articulatedOf, bentFromRest, type PartPose, type Pose } from './sequences';
import { gearPose } from './site-ways';

/**
 * **The articulated copy of a transport in flight** (#507): its gear folded, its parts posed by
 * what a timeline says (`bay_door`, #481). Free of any figurine.
 */
export class FlightCopy {
  /** Stands where the caller puts it: its origin is the airdrop's target, in board units. */
  readonly copy = new Group();
  /** The plane's root: placed and turned by the pose's `root`, from the origin of `copy`. */
  private readonly root = new Group();
  private readonly rests = new Map<Object3D, { position: Vector3; quaternion: Quaternion }>();

  constructor(rig: Object3D) {
    // At its real size on the board, as the figurine is at the common scale.
    rig.scale.setScalar(troopSpan('airTransport') / measureOf(rig, 'airTransport'));
    this.root.add(rig);
    this.copy.add(this.root);
    rig.traverse((node) => {
      if (!isRigPart('airTransport', node.name)) return;
      this.rests.set(node, {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
      });
    });
    this.pose({});
  }

  /** The plane where `root` puts it (`travel` and `heading`; no pitch nor roll, a level pass),
   *  every part from its rest, the gear up, then moved as `pose` says. */
  pose(pose: Pose<'airTransport'>): void {
    this.root.position.set(...(pose.root?.travel ?? [0, 0, 0]));
    this.root.rotation.y = pose.root?.heading ?? 0;
    const gear = gearPose('airTransport', 1) as Record<string, PartPose>;
    const given = pose as Record<string, PartPose | undefined>;
    for (const [node, rest] of this.rests) {
      const own = given[node.name] ?? gear[node.name];
      bentFromRest(node, rest, own);
    }
  }

  /**
   * **Where the crate leaves the plane**, as `airdrop({ release })` takes it: `fx_parachute`'s
   * offset from the plane's root, in board units, in the flight's frame (x along the flight, y
   * up, z to its right) — read with the root at the origin, level and at heading zero, whatever
   * the pose placed. `null` when the model has no `fx_parachute`.
   */
  release(): readonly [x: number, y: number, z: number] | null {
    this.copy.updateWorldMatrix(true, true);
    const at = markOf(this.root, 'fx_parachute');
    if (at === null) return null;
    // The model faces +z and has its x to the left of its flight: the flight's frame is turned
    // a quarter from it (`airdrop`'s `turned`).
    const { x, y, z } = this.root.worldToLocal(at);
    return [z, y, -x];
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
