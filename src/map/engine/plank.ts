import { BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { PALETTE } from './palette';
import type { Plank } from './timelines/plane-boarding';

const UP = new Vector3(0, 1, 0);
const NONE = new Vector3();

/**
 * **A plane's provisional plank** (#502), a box of the board while the GLB has no `echelle`:
 * stretched from the sill to the foot as `planeBoardingOf` says, standing on the ground at `lift`.
 * Its width stays level, whatever its slope; a null plank is not drawn.
 */
export class PlankMesh extends Mesh<BoxGeometry, MeshBasicMaterial> {
  constructor() {
    super(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: PALETTE.plinthBottom }));
    this.visible = false;
  }

  place(plank: Plank | null, lift: number): void {
    this.visible = plank !== null;
    if (plank === null) return;
    const from = new Vector3(...plank.from);
    const to = new Vector3(...plank.to);
    const along = to.clone().sub(from);
    this.position.copy(from).add(to).multiplyScalar(0.5);
    this.position.y += lift;
    this.scale.set(plank.width, plank.thick, Math.max(along.length(), 1e-6));
    this.quaternion.setFromRotationMatrix(new Matrix4().lookAt(along, NONE, UP));
  }

  dispose(): void {
    this.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
