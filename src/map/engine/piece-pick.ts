import { Box3, type Mesh, type Object3D, type Raycaster } from 'three';

/** A piece the pointer is over: the label it answers to, and how far from the eye. */
export type PieceHit = { readonly id: string; readonly distance: number };

const box = new Box3();

const inSight = (object: Object3D): boolean => {
  for (let at: Object3D | null = object; at !== null; at = at.parent) if (!at.visible) return false;
  return true;
};

/**
 * How far along `ray` the drawn surfaces of `object` are met, `null` when they are not: its world
 * box first, so a pointer nowhere near costs one test and no triangle. What lies on the ground
 * under it — a contact shadow, a ring (`userData.ground`) — is the board's, not the piece's.
 */
export function drawnHit(ray: Raycaster, object: Object3D): number | null {
  if (!inSight(object) || !ray.ray.intersectsBox(box.setFromObject(object))) return null;
  let nearest: number | null = null;
  object.traverseVisible((part) => {
    if ((part as Mesh).isMesh !== true || part.userData.ground === true) return;
    const hit = ray.intersectObject(part, false)[0];
    if (hit !== undefined && (nearest === null || hit.distance < nearest)) nearest = hit.distance;
  });
  return nearest;
}

export const nearer = (first: PieceHit | null, second: PieceHit | null): PieceHit | null =>
  first === null || (second !== null && second.distance < first.distance) ? second : first;
