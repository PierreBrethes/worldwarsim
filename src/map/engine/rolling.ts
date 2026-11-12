import type { Mesh, Object3D } from 'three';
import type { UnitRole } from '@/domain/ids';

/** **The angle a wheel turns by on the road** (#539): the road walked over its radius, in the
 *  same unit — never a time, so a wheel stops with its piece and a long frame turns it as far
 *  as the short ones it replaces. */
export const rolledAngle = (travelled: number, radius: number): number => travelled / radius;

const isMesh = (node: Object3D): boolean => (node as Mesh).isMesh === true;

/** The roles whose wheels turn, and the names of their wheels: a truck's `roue_*`, one per
 *  wheel, and a gun's `wheels_*`, one per side. */
const WHEELS: Partial<Record<UnitRole, RegExp>> = {
  landTransport: /^roue_(left|right)_\d+$/,
  artillery: /^wheels_(left|right)$/,
};

/**
 * **A wheel the bake keeps as a node of its own** so that it can turn (#539). Only a truck's and
 * a gun's: a tank's road wheels would cost a draw call a material each, for a tread seen from
 * above — and `wheels_*` there, and on a truck, is only the group its wheels hang from.
 */
export const rolls = (node: Object3D, role: UnitRole): boolean =>
  WHEELS[role]?.test(node.name) === true;

/** A wheel found on a baked model, and its radius in the model's own units. */
export type Roller = { readonly part: Object3D; readonly radius: number };

/** The wheels of a baked model, each with its tyre's radius: half its height, the hub being
 *  at the node's origin and the wheel upright on the road. */
export function rollersOf(root: Object3D, role: UnitRole): Roller[] {
  const found: Roller[] = [];
  root.traverse((part) => {
    if (!rolls(part, role)) return;
    const meshes = isMesh(part) ? [part as Mesh] : (part.children.filter(isMesh) as Mesh[]);
    let [low, high] = [Infinity, -Infinity];
    for (const { geometry } of meshes) {
      geometry.computeBoundingBox();
      low = Math.min(low, geometry.boundingBox!.min.y);
      high = Math.max(high, geometry.boundingBox!.max.y);
    }
    if (high > low) found.push({ part, radius: (high - low) / 2 });
  });
  return found;
}
