import { Box3, type Camera, type Mesh, type Object3D, type Raycaster, Vector3 } from 'three';
import type { Rect } from '@/domain/poster-placement';
import { pieceScale } from './piece-scale';

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
 * under it — an altitude shadow, a ring (`userData.ground`) — is the board's, not the piece's.
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

/** A piece drawn or, where a rifle is a pixel wide, the footprints it is taken by. */
export const footedHit = (
  ray: Raycaster,
  object: Object3D,
  footprints: ReadonlyArray<Object3D>,
): number | null =>
  drawnHit(ray, object) ?? ray.intersectObjects([...footprints], false)[0]?.distance ?? null;

/** **The least width a piece takes on screen**, in CSS pixels (ADR 0035 §4): a small piece stays
 *  easy to take. `@a-mesurer` */
export const LEAST_TARGET_PX = 28;

/** **A piece small on screen is taken within half `LEAST_TARGET_PX` of its foot**: how far along
 *  `ray` that foot is, `null` when the ray passes further off. */
export function leastHit(ray: Raycaster, at: Vector3): number | null {
  const away = ray.ray.origin.distanceTo(at);
  const reach = ((LEAST_TARGET_PX / 2) * away) / pieceScale.pxPerUnit;
  return ray.ray.distanceToPoint(at) <= reach ? away : null;
}

export const nearer = (first: PieceHit | null, second: PieceHit | null): PieceHit | null =>
  first === null || (second !== null && second.distance < first.distance) ? second : first;

const scratch = new Box3();
const corner = new Vector3();

/** The world box of what `object` draws, ground shadows apart. Shared: read it before the next call. */
export function boxOfObject(object: Object3D): Box3 {
  scratch.makeEmpty();
  object.traverseVisible((part) => {
    if ((part as Mesh).isMesh === true && part.userData.ground !== true)
      scratch.expandByObject(part);
  });
  return scratch;
}

/** Where a world box falls on the screen, in the canvas's pixels. */
export function screenRect(box: Box3, camera: Camera, width: number, height: number): Rect {
  const rect = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).project(camera);
        const px = ((corner.x + 1) / 2) * width;
        const py = ((1 - corner.y) / 2) * height;
        rect.left = Math.min(rect.left, px);
        rect.right = Math.max(rect.right, px);
        rect.top = Math.min(rect.top, py);
        rect.bottom = Math.max(rect.bottom, py);
      }
  return rect;
}
