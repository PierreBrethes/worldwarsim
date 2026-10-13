import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, type Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { REPLAY_MS, replayAt } from '@/domain/replay';
import type { ReplayView } from '@/domain/player-view';
import { FIGURINE_SCALE } from './figurines/figurine';
import { ReplayScene } from './replay';

// The scene draws its pictograms and flashes on a canvas: a node run has none, a stub does.
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {},
  });
});

/** The combat of the Luxembourg seen from France: one enemy troop, destroyed. */
const luxembourg: ReplayView = {
  combatId: 'c',
  at: 0,
  point: { lon: 6.1, lat: 49.6 },
  side: 'defender',
  won: true,
  mine: [{ role: 'infantry', tier: 1, troops: 3, lost: 25, routed: 0, destroyed: 0 }],
  theirs: { troops: 1, lost: 50, routed: 0, destroyed: 1 },
};

/** The height of a piece's body: the block's wood and back, or the card of a figurine-less role. */
const heightOf = (object: Object3D): number => {
  object.updateMatrixWorld(true);
  const box = new Box3();
  object.traverse((part) => {
    if (
      part instanceof Mesh &&
      (part.geometry instanceof RoundedBoxGeometry || part.geometry.type === 'PlaneGeometry')
    )
      box.expandByObject(part);
  });
  return box.max.y - box.min.y;
};

describe('ReplayScene', () => {
  it('lays a destroyed block flat, where a standing one stands tall', () => {
    const scene = new ReplayScene(null, replayAt(luxembourg, 0).pieces, 'land');
    const theirs = (k: number) => scene.object.children[k]!;
    scene.show(replayAt(luxembourg, REPLAY_MS / 2 - 3000), 0, true);
    expect(heightOf(theirs(3))).toBeCloseTo(1.9 * FIGURINE_SCALE, 2);
    scene.show(replayAt(luxembourg, REPLAY_MS), 0, true);
    // Lying, it is no taller than the block is thick: tipped in the eye's plane it read as standing.
    expect(heightOf(theirs(3))).toBeLessThan(0.62 * FIGURINE_SCALE);
  });

  it('lays my destroyed troop down, and leaves the merely battered one standing', () => {
    const view: ReplayView = {
      ...luxembourg,
      mine: [{ role: 'infantry', tier: 1, troops: 2, lost: 40, routed: 0, destroyed: 1 }],
    };
    const scene = new ReplayScene(null, replayAt(view, 0).pieces, 'land');
    scene.show(replayAt(view, 0), 0, true);
    const standing = heightOf(scene.object.children[0]!);
    scene.show(replayAt(view, REPLAY_MS), 0, true);
    expect(heightOf(scene.object.children[0]!)).toBeLessThan(standing / 2);
    expect(heightOf(scene.object.children[1]!)).toBeCloseTo(standing);
  });
});
