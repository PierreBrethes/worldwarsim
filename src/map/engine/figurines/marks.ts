import { type Object3D, Vector3 } from 'three';

/**
 * **A hull's marker in map coordinates** (`fx_passerelle`, `fx_amarre_*`, `fx_charge_*`,
 * `fx_porte`…): `root` is a figurine's `object`, which holds the model drawn or the articulated
 * copy standing in for it, so the marker is read where a posed door or a plane aloft has put it.
 * `null` when the model carries none.
 */
export function markOf(root: Object3D, name: string, into = new Vector3()): Vector3 | null {
  const mark = root.getObjectByName(name);
  return mark === undefined ? null : mark.getWorldPosition(into);
}
