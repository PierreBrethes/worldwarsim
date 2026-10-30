import { Group, MeshStandardMaterial, type Vector3 } from 'three';
import { CRATE_METRES, CRATE_SLATS, CRATE_WOOD, crateOf } from './crate';
import { ANONYMOUS_SPAN, FIGURINE_SCALE, troopScale } from './figurines/figurine';

const WOOD = new MeshStandardMaterial({ color: CRATE_WOOD, roughness: 0.8 });
const SLATS = new MeshStandardMaterial({ color: CRATE_SLATS, roughness: 0.8 });
/** Where this layer converts the crate's metres: a tank is 6 m and 2.6 model units long. */
const METRES_PER_UNIT = 6 / 2.6;
const CRATE_UNITS = CRATE_METRES / METRES_PER_UNIT;

/** Beside the piece, three on the ground and the fourth on top: what the quarters stack up. */
const SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1.5, 0, 0.3],
  [-1.5, 0, 1.0],
  [-0.85, 0, 0.65],
  [-1.2, CRATE_UNITS, 0.65],
];
const DROP_FROM = 1.6;
/** Well under `SETTLE_MS`, and a thread on screen keeps the frames coming anyway. */
const FALL_MS = 260;

function crate(turn: number): Group {
  const object = crateOf(WOOD, SLATS, true);
  object.scale.setScalar(1 / METRES_PER_UNIT);
  object.rotation.y = turn * 0.4;
  return object;
}

/**
 * **The crates of my pile loading on site** (table d'état-major, 14): one per quarter, and they
 * stay until it leaves. Those already due when the pile is first seen stand at once — only a
 * quarter crossed under the eye falls, and only at full motion.
 */
export class CratePile {
  readonly object = new Group();
  private readonly drops: Array<{ readonly crate: Group; readonly since: number }> = [];

  constructor(crates: number) {
    this.object.scale.setScalar(FIGURINE_SCALE);
    this.fill(crates, -Infinity);
  }

  update(crates: number, now: number, falls: boolean): void {
    this.fill(crates, falls ? now : -Infinity);
    for (const [k, { crate, since }] of this.drops.entries()) {
      const t = Math.min(1, (now - since) / FALL_MS);
      crate.position.y = SPOTS[k]![1] + DROP_FROM * (1 - t * t);
    }
  }

  place(ground: Vector3, cameraPosition: Vector3): void {
    this.object.position.copy(ground);
    // Beside its pawn, they grow with it by the floor (ADR 0035 §10), measured as a tank.
    const scale = troopScale(ground.distanceTo(cameraPosition), ANONYMOUS_SPAN);
    this.object.visible = scale > 0;
    this.object.scale.setScalar(FIGURINE_SCALE * scale);
  }

  private fill(crates: number, since: number): void {
    for (let k = this.drops.length; k < Math.min(crates, SPOTS.length); k++) {
      const object = crate(k);
      const [x, , z] = SPOTS[k]!;
      object.position.set(x, SPOTS[k]![1], z);
      this.object.add(object);
      this.drops.push({ crate: object, since });
    }
  }
}
