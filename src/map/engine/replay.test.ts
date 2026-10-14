import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, type Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { REPLAY_MS, replayAt, stepBounds, VOLLEY_SHARE, type ReplayStep } from '@/domain/replay';
import type { ReplayView } from '@/domain/player-view';
import { FIGURINE_SCALE } from './figurines/figurine';
import { ReplayScene, salvoTarget, shakeOf, shotShare } from './replay';

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

/** The middle of a fire step's volley, and a moment just after its shots land. */
const inVolley = (step: ReplayStep) => {
  const { start, end } = stepBounds(step);
  return start + (VOLLEY_SHARE / 2) * (end - start);
};
const justLanded = (step: ReplayStep) => {
  const { start, end } = stepBounds(step);
  return start + VOLLEY_SHARE * (end - start) + 50;
};

describe('the strike and the riposte', () => {
  it('cross the gap both ways, each line at the other', () => {
    // Two of mine, one block: both of mine aim at it, and it answers the first of mine.
    expect([0, 1, 2].map((k) => salvoTarget(k, 2, 1))).toEqual([2, 2, 0]);
    expect(salvoTarget(0, 1, 0)).toBeNull();
    expect(salvoTarget(0, 0, 1)).toBeNull();
  });

  it('fly through the salvo step, staggered, and hold halfway at reduced motion', () => {
    expect(shotShare(0, 0, false)).toBeNull();
    expect(shotShare(0.5, 0, false)).toBeCloseTo(0.5);
    expect(shotShare(0.05, 2, false)).toBeNull();
    expect(shotShare(1, 0, false)).toBeNull();
    expect(shotShare(0, 1, true)).toBe(0.5);
  });

  it('shake both lines as a volley lands, briefly, and never at reduced motion', () => {
    expect(shakeOf(replayAt(luxembourg, justLanded('frappe')), false)).not.toBe(0);
    expect(shakeOf(replayAt(luxembourg, justLanded('riposte')), false)).not.toBe(0);
    expect(shakeOf(replayAt(luxembourg, inVolley('frappe')), false)).toBe(0);
    expect(shakeOf(replayAt(luxembourg, stepBounds('deroute').start + 50), false)).toBe(0);
    expect(shakeOf(replayAt(luxembourg, justLanded('frappe')), true)).toBe(0);
  });

  it('fires the attacker in the strike, then what stands of the defence in the riposte', () => {
    // Luxembourg seen from France, the defender: one enemy block strikes my three, then my three
    // answer — and once the block is down, nothing of theirs is left to fire.
    const scene = new ReplayScene(null, replayAt(luxembourg, 0).pieces, 'land');
    const shooting = () =>
      scene.object.children
        .slice(4)
        .map((shot, k) => (shot.visible ? k : -1))
        .filter((k) => k >= 0);
    scene.show(replayAt(luxembourg, inVolley('frappe')), 0, false);
    expect(shooting()).toEqual([3]);
    scene.show(replayAt(luxembourg, inVolley('riposte')), 0, false);
    expect(shooting()).toEqual([0, 1, 2]);
    scene.show(replayAt(luxembourg, REPLAY_MS), 0, false);
    expect(shooting()).toEqual([]);
  });

  it('gives no riposte to a line the strike laid down', () => {
    const attacked: ReplayView = {
      ...luxembourg,
      side: 'attacker',
      mine: [{ role: 'infantry', tier: 1, troops: 2, lost: 0, routed: 0, destroyed: 0 }],
      theirs: { troops: 1, lost: 50, routed: 0, destroyed: 1 },
    };
    const scene = new ReplayScene(null, replayAt(attacked, 0).pieces, 'land');
    scene.show(replayAt(attacked, inVolley('riposte')), 0, false);
    expect(scene.object.children.slice(3).some((shot) => shot.visible)).toBe(false);
  });
});

describe('the replay of a bombardment (A4)', () => {
  const gunner: ReplayView = {
    ...luxembourg,
    side: 'attacker',
    mine: [{ role: 'artillery', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }],
    theirs: { troops: 1, lost: 60, routed: 0, destroyed: 1 },
    bombardment: { from: { lon: 4, lat: 49.6 } },
  };
  const target: ReplayView = {
    ...luxembourg,
    mine: [{ role: 'infantry', tier: 1, troops: 1, lost: 60, routed: 0, destroyed: 1 }],
    bombardment: {},
  };

  it('keeps the battery where it fired from, and lays its ink stroke onto the target', () => {
    const scene = new ReplayScene(null, replayAt(gunner, 0).pieces, 'land', { battery: [-3, 1] });
    const [battery, block] = scene.object.children;
    const stroke = scene.object.children[2] as Mesh;
    expect([battery!.position.x, battery!.position.z]).toEqual([-3, 1]);
    scene.show(replayAt(gunner, justLanded('frappe')), 0, false);
    expect(stroke.visible).toBe(true);
    const reach = Math.hypot(block!.position.x + 3, block!.position.z - 1);
    expect(stroke.scale.z * 0.24).toBeCloseTo(reach, 1);
    scene.show(replayAt(gunner, inVolley('riposte')), 0, false);
    expect(stroke.visible).toBe(false);
  });

  it('draws nothing it fired from at the target: the shell falls on it from above', () => {
    const scene = new ReplayScene(null, replayAt(target, 0).pieces, 'land', 'unseen');
    expect(scene.object.children).toHaveLength(2);
    const shell = scene.object.children[1]!;
    scene.show(replayAt(target, inVolley('frappe')), 0, false);
    expect(shell.visible).toBe(true);
    expect(shell.position.y).toBeGreaterThan(scene.object.children[0]!.position.y + 0.12);
  });
});
