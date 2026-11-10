import type { Object3D } from 'three';

/**
 * **What is not drawn is not placed.** Before each frame three walks every node of the scene to
 * place it in the world, drawn or not: on a board of a thousand piles gone to their pins, sixty
 * nodes each, that walk was four fifths of the map's time (profil du 10/11, `updateMatrixWorld`).
 *
 * Under `parent`, a hidden child is placed alone. What reads it — a sequence that calls
 * `updateMatrixWorld` on one of its parts, a `getWorldPosition` — finds it where it is, and its
 * parts are placed by the frame that shows it: three places them all then, their root having
 * just been.
 */
export function leaveHiddenPartsUnplaced(parent: Object3D): void {
  parent.updateMatrixWorld = function (this: Object3D): void {
    this.updateWorldMatrix(false, false);
    for (const child of this.children) {
      if (child.visible) child.updateMatrixWorld(true);
      else child.updateWorldMatrix(false, false);
    }
  };
}
