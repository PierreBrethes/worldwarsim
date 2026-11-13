import { type Object3D, Quaternion, Vector3 } from 'three';
import { BOOM, type Boom } from './derrick';

/**
 * **A cargo file's masts** (`mat_charge_N`) with the hold each serves (`hold_hatch_N`, its black
 * plane `fond_sombre_N`), in the file's own metres, by number. A mast without its hatch is left
 * out: nothing to lower a load into.
 */
export function boomsOfScene(scene: Object3D): Boom[] {
  scene.updateMatrixWorld(true);
  const booms: Boom[] = [];
  scene.traverse((node) => {
    const n = /^mat_charge_(\d+)$/.exec(node.name)?.[1];
    const hatch = n === undefined ? undefined : scene.getObjectByName(`hold_hatch_${n}`);
    const dark = n === undefined ? undefined : scene.getObjectByName(`fond_sombre_${n}`);
    if (n === undefined || hatch === undefined || dark === undefined) return;
    const pivot = node.getWorldPosition(new Vector3());
    const aim = new Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new Quaternion()));
    const floor = dark.getWorldPosition(new Vector3());
    const tip = scene.getObjectByName(`fx_charge_${n}`)?.getWorldPosition(new Vector3());
    const rim = hatch.getWorldPosition(new Vector3()).y;
    booms.push({
      n: Number(n),
      pivot: [pivot.x, pivot.y, pivot.z],
      length: tip === undefined ? BOOM : tip.distanceTo(pivot),
      rest: { yaw: Math.atan2(aim.x, aim.z), lift: Math.asin(aim.y) },
      hatch: { at: [floor.x, rim, floor.z], rim },
    });
  });
  return booms.sort((a, b) => a.n - b.n);
}
