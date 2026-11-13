import { Vector3, type Object3D } from 'three';
import type { PlaneRig } from '../timelines/plane-boarding';
import { markOf } from './marks';

/**
 * **What a plane drawn gives its boarding** (#502): the `cabin_door` hinge and the `fx_porte`
 * foot in the file's metres, root at its wheels, the tail-down tilt it is drawn at, and the board
 * units a metre of it is. `object` is a figurine's, holding `model` (scaled to the board) first.
 * The eight files differ by metres, so nothing here is a constant. `null` without either marker.
 */
export function planeRigOf(object: Object3D): { rig: PlaneRig; metre: number } | null {
  const model = object.children[0];
  const door = markOf(object, 'cabin_door');
  const foot = markOf(object, 'fx_porte');
  if (model === undefined || door === null || foot === null) return null;
  model.updateWorldMatrix(true, false);
  const hinge = model.worldToLocal(door);
  const ground = model.worldToLocal(foot);
  return {
    rig: {
      hinge: [hinge.x, hinge.y, hinge.z],
      foot: [ground.x, ground.z],
      pitch: -model.rotation.x,
    },
    metre: model.getWorldScale(new Vector3()).x,
  };
}
