import { describe, expect, it } from 'vitest';
import { Group, Mesh, Scene, Vector3 } from 'three';
import { leaveHiddenPartsUnplaced } from './hidden-parts';

/** Where a node was last placed in the world, along x, without asking three to place it. */
const placedAt = (node: Group | Mesh): number => node.matrixWorld.elements[12]!;

/** A board in a scene, a pile on it, a man in the pile. */
function board() {
  const scene = new Scene();
  const piles = new Group();
  const pile = new Group();
  const man = new Mesh();
  scene.add(piles.add(pile.add(man)));
  pile.position.set(5, 0, 0);
  man.position.set(1, 0, 0);
  leaveHiddenPartsUnplaced(piles);
  return { scene, pile, man };
}

describe('leaveHiddenPartsUnplaced', () => {
  it('places a pile that is drawn, and its men, as three does', () => {
    const { scene, pile, man } = board();
    scene.updateMatrixWorld();
    expect([placedAt(pile), placedAt(man)]).toEqual([5, 6]);
    pile.position.x = 7;
    scene.updateMatrixWorld();
    expect([placedAt(pile), placedAt(man)]).toEqual([7, 8]);
  });

  it('places a hidden pile alone: its men wait for the frame that shows it', () => {
    const { scene, pile, man } = board();
    scene.updateMatrixWorld();
    pile.visible = false;
    pile.position.x = 10;
    scene.updateMatrixWorld();
    expect([placedAt(pile), placedAt(man)]).toEqual([10, 6]);
    pile.visible = true;
    scene.updateMatrixWorld();
    expect(placedAt(man)).toBe(11);
  });

  it('still answers where a man of a hidden pile stands, to what asks', () => {
    const { scene, pile, man } = board();
    scene.updateMatrixWorld();
    pile.visible = false;
    pile.position.x = 10;
    scene.updateMatrixWorld();
    expect(man.getWorldPosition(new Vector3()).x).toBe(11);
    // What a sequence does before it reads a piece of the pile.
    pile.position.x = 20;
    scene.updateMatrixWorld();
    man.updateMatrixWorld(true);
    expect(placedAt(man)).toBe(21);
  });
});
