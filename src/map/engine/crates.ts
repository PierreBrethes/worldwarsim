import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Vector3 } from 'three';
import { ANONYMOUS_SPAN, FIGURINE_SCALE, pieceWeight } from './figurines/figurine';
import { pieceScale } from './piece-scale';

/** The prototype's crate (`table-etat-major.html`), in model units: a box and two slats. */
const SIDE = 0.5;
const BOX = new BoxGeometry(SIDE, SIDE, SIDE);
BOX.translate(0, SIDE / 2, 0);
const SLAT = new BoxGeometry(0.52, 0.06, 0.52);
const WOOD = new MeshStandardMaterial({ color: '#8a6a3e', roughness: 0.8 });
const SLATS = new MeshStandardMaterial({ color: '#5e4526', roughness: 0.8 });

/** Beside the piece, three on the ground and the fourth on top: what the quarters stack up. */
const SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [-1.5, 0, 0.3],
  [-1.5, 0, 1.0],
  [-0.85, 0, 0.65],
  [-1.2, SIDE, 0.65],
];
const DROP_FROM = 1.6;
/** Well under `SETTLE_MS`, and a thread on screen keeps the frames coming anyway. */
const FALL_MS = 260;

function crate(turn: number): Group {
  const object = new Group();
  const box = new Mesh(BOX, WOOD);
  box.castShadow = true;
  object.add(box);
  for (const y of [0.1, 0.4]) {
    const slat = new Mesh(SLAT, SLATS);
    slat.position.y = y;
    slat.castShadow = true;
    object.add(slat);
  }
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
    const near = pieceWeight(ground.distanceTo(cameraPosition), ANONYMOUS_SPAN);
    this.object.visible = near > 0;
    this.object.scale.setScalar(FIGURINE_SCALE * near * pieceScale.size);
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
