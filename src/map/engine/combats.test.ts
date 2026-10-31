import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FINAL_POSE_MS } from '@/domain/combat-on-map';
import type { ReplayView } from '@/domain/player-view';
import { REPLAY_MS, stepBounds } from '@/domain/replay';
import { CombatLayer } from './combats';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {},
  });
});

/** Two blocks against my two men: one of theirs falls, one of mine routs. */
const combat = (id: string, troops = 2): ReplayView => ({
  combatId: id,
  at: 0,
  point: { lon: 4.9, lat: 49.7 },
  side: 'attacker',
  won: true,
  mine: [{ role: 'infantry', tier: 1, troops, lost: 10, routed: 1, destroyed: 0 }],
  theirs: { troops: 2, lost: 50, routed: 0, destroyed: 1 },
});

const scale = () => 1;
const at = new Vector3();

describe('CombatLayer', () => {
  it('plays three combats at once, and holds the final pose of a fourth', () => {
    const layer = new CombatLayer();
    for (const id of ['a', 'b', 'c', 'd']) layer.play(combat(id), null, at, 0, 0);
    layer.advance(0, scale);
    expect(layer.active).toBe(true);
    layer.advance(FINAL_POSE_MS + 1, scale);
    expect(layer.group.children).toHaveLength(3);
    layer.advance(REPLAY_MS, scale);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.active).toBe(false);
  });

  it('holds the final pose of a combat of more than twelve pieces a side', () => {
    const layer = new CombatLayer();
    layer.play(combat('a', 13), null, at, 0, 0);
    expect(layer.active).toBe(false);
    layer.advance(FINAL_POSE_MS + 1, scale);
    expect(layer.group.children).toHaveLength(0);
  });

  it('asks a whole frame per step when reduced, and none between', () => {
    const layer = new CombatLayer();
    layer.motion = 'reduced';
    layer.play(combat('a'), null, at, 0, 0);
    expect(layer.active).toBe(false);
    expect(layer.advance(0, scale)).toBe(true);
    expect(layer.advance(100, scale)).toBe(false);
    expect(layer.advance(stepBounds('pose').start + 1, scale)).toBe(true);
    expect(layer.advance(REPLAY_MS, scale)).toBe(true);
    expect(layer.group.children).toHaveLength(0);
  });

  it('shows the final pose alone when cut: one frame as it comes, one as it goes', () => {
    const layer = new CombatLayer();
    layer.motion = 'off';
    layer.play(combat('a'), null, at, 0, 0);
    expect(layer.active).toBe(false);
    expect(layer.advance(0, scale)).toBe(true);
    expect(layer.advance(FINAL_POSE_MS / 2, scale)).toBe(false);
    expect(layer.advance(FINAL_POSE_MS + 1, scale)).toBe(true);
    expect(layer.group.children).toHaveLength(0);
  });

  it('turns the attacker about on the spot by the end, and sets the defender on the point', () => {
    const layer = new CombatLayer();
    layer.motion = 'off';
    layer.play(combat('a'), null, at, 0, 0);
    layer.advance(0, scale);
    const scene = layer.group.children[0]!;
    // My two men (the attacker's), then their two: holders first, in that order.
    const [mine, , theirs] = scene.children;
    expect(mine!.rotation.y).toBeCloseTo(Math.PI / 2 + Math.PI);
    // A block, unturned: the defender does not walk home.
    expect(theirs!.rotation.y).toBeCloseTo(0);
    // Their line, the defender's, stands across the point.
    scene.updateMatrixWorld(true);
    expect(theirs!.getWorldPosition(new Vector3()).x).toBeCloseTo(0);
  });

  it('shows nothing past the floor, and veils nothing there', () => {
    const layer = new CombatLayer();
    layer.play(combat('a'), null, at, 0, 0);
    layer.advance(0, () => 0);
    expect(layer.group.children[0]!.visible).toBe(false);
    expect(layer.veils).toHaveLength(0);
  });
});
