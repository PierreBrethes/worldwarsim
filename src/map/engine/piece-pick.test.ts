import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { drawnHit, leastHit, nearer } from './piece-pick';
import { pieceScale } from './piece-scale';

const down = (x: number) => new Raycaster(new Vector3(x, 10, 0), new Vector3(0, -1, 0));

function piece(): Group {
  const object = new Group();
  object.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial()));
  const shadow = new Mesh(new CircleGeometry(3), new MeshBasicMaterial());
  shadow.rotation.x = -Math.PI / 2;
  shadow.userData.ground = true;
  object.add(shadow);
  object.updateMatrixWorld();
  return object;
}

describe('drawnHit', () => {
  it('meets the piece where it is drawn', () => {
    expect(drawnHit(down(0), piece())).toBeCloseTo(9);
  });

  it('leaves the shadow on the ground to the board', () => {
    expect(drawnHit(down(2), piece())).toBeNull();
  });

  it('does not meet a piece out of sight', () => {
    const hidden = new Group();
    const object = piece();
    hidden.add(object);
    hidden.visible = false;
    expect(drawnHit(down(0), object)).toBeNull();
  });
});

describe('nearer', () => {
  it('keeps the piece nearest the eye', () => {
    expect(nearer({ id: 'a', distance: 3 }, { id: 'b', distance: 2 })?.id).toBe('b');
    expect(nearer(null, { id: 'b', distance: 2 })?.id).toBe('b');
    expect(nearer({ id: 'a', distance: 3 }, null)?.id).toBe('a');
  });
});

/** A piece small on screen is taken within half the least target of its foot (ADR 0035 §4). */
describe('leastHit', () => {
  it('takes a pointer some ten pixels off a small piece, not thirty', () => {
    pieceScale.pxPerUnit = 1000;
    // Ten units away, a pixel is a hundredth of a unit.
    expect(leastHit(down(0.1), new Vector3(0, 0, 0))).toBeCloseTo(10, 1);
    expect(leastHit(down(0.3), new Vector3(0, 0, 0))).toBeNull();
  });
});
