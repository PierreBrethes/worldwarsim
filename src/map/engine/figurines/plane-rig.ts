import { Box3, Vector3, type Object3D } from 'three';
import type { PlaneRig } from '../timelines/plane-boarding';

/** **What the plane's file gives its boarding** (#502), in its metres, root at its wheels: the
 *  door's hinge, the foot, and how far behind the wheels its tail ends. */
export type PlaneFile = Pick<PlaneRig, 'hinge' | 'foot'> & { readonly tail: number };

/**
 * **The `cabin_door` hinge and the `fx_porte` foot of a plane's articulated rig** (`articulatedOf`):
 * the drawn instance has merged the door away, the rig keeps it at its pivot. `null` when the file
 * carries either no longer. The eight files differ by metres, so nothing here is a constant.
 */
const tailOf = (rig: Object3D): number => {
  const box = new Box3().setFromObject(rig);
  return box.isEmpty() ? 0 : -box.min.z;
};

export function planeFileOf(rig: Object3D): PlaneFile | null {
  rig.updateWorldMatrix(true, true);
  const door = rig.getObjectByName('cabin_door')?.getWorldPosition(new Vector3());
  const foot = rig.getObjectByName('fx_porte')?.getWorldPosition(new Vector3());
  if (door === undefined || foot === undefined) return null;
  return {
    hinge: [door.x, door.y, door.z],
    foot: [foot.x, foot.z],
    tail: tailOf(rig),
  };
}

/**
 * **A plane drawn, read for its boarding** (#502): its file's door and foot, the tail-down tilt it
 * is drawn at (0 for a plane stood level on an apron) and the board units a metre of it is.
 * `object` is a figurine's, holding `model` (scaled to the board) first.
 */
export function planeRigOf(
  object: Object3D,
  file: PlaneFile,
): { rig: PlaneRig; metre: number; tail: number } | null {
  const model = object.children[0];
  if (model === undefined) return null;
  object.updateWorldMatrix(true, true);
  return {
    rig: { hinge: file.hinge, foot: file.foot, pitch: -model.rotation.x },
    tail: file.tail,
    metre: model.getWorldScale(new Vector3()).x,
  };
}
