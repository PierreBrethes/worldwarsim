import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { FINAL_POSE_MS } from '@/domain/combat-on-map';
import type { ReplayView } from '@/domain/player-view';
import { REPLAY_MS, stepBounds } from '@/domain/replay';
import { CombatLayer, WAIT_MS } from './combats';

const heard = vi.hoisted(() => [] as string[]);
vi.mock('../table-sound', () => ({ playTableSound: (sound: string) => heard.push(sound) }));

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

describe('CombatLayer, after the review', () => {
  it('drops a waiting point after WAIT_MS, with a whole frame to show the board again', () => {
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.wait('a', at, 0);
    expect(layer.advance(10, scale)).toBe(false);
    expect(layer.veils).toHaveLength(1);
    expect(layer.advance(WAIT_MS + 1, scale)).toBe(true);
    expect(layer.veils).toHaveLength(0);
    expect(settled).toEqual(['a']);
  });

  it('clears every scene and every wait, settling each (a replay opens)', () => {
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.play(combat('a'), null, at, 0, 0);
    layer.wait('b', at, 0);
    layer.advance(0, scale);
    layer.clear();
    expect(layer.group.children).toHaveLength(0);
    expect(layer.active).toBe(false);
    layer.advance(1, scale);
    expect(layer.veils).toHaveLength(0);
    expect(settled.sort()).toEqual(['a', 'b']);
  });

  it('leaves the dispatch to the stamp when one went up, and settles it when none did (#327)', () => {
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.play(combat('a'), null, at, 0, 0);
    layer.play(combat('big', 13), null, at, 0, 0);
    // Not at once: the final pose's stamp is not born yet.
    expect(settled).toEqual([]);
    layer.advance(0, scale);
    layer.advance(stepBounds('compte-rendu').start + 1, scale);
    layer.advance(REPLAY_MS, scale);
    // Both stamped: the stamp lifting releases each dispatch, not the layer.
    expect(settled).toEqual([]);
    layer.play(combat('far'), null, at, 0, 0);
    layer.play(combat('far-big', 13), null, at, 0, 0);
    layer.advance(1000, () => 0);
    layer.advance(1000 + REPLAY_MS, () => 0);
    expect(settled.sort()).toEqual(['far', 'far-big']);
  });

  it('plays one combat of six pieces a side at most on a phone (décision de Pierre du 31/10)', () => {
    const layer = new CombatLayer();
    layer.phone = true;
    layer.play(combat('seven', 7), null, at, 0, 0);
    expect(layer.active).toBe(false);
    layer.play(combat('a'), null, at, 0, 0);
    layer.play(combat('b'), null, at, 0, 0);
    expect(layer.group.children).toHaveLength(3);
    layer.advance(0, scale);
    expect(layer.active).toBe(true);
  });

  it('is silent past the floor, where nothing shows', () => {
    const layer = new CombatLayer();
    layer.play(combat('a'), null, at, 0, 0);
    heard.length = 0;
    layer.advance(stepBounds('frappe').start + 10, () => 0);
    expect(heard).toEqual([]);
    layer.advance(stepBounds('frappe').start + 20, scale);
    expect(heard).toEqual(['fire']);
  });
});

describe('CombatLayer, the report stamp (#327)', () => {
  const reported = (layer: CombatLayer) => {
    const ids: string[] = [];
    layer.onReport = (view) => ids.push(view.combatId);
    return ids;
  };

  it('reports a played combat once, as its account begins', () => {
    const layer = new CombatLayer();
    const ids = reported(layer);
    layer.play(combat('a'), null, at, 0, 0);
    layer.advance(stepBounds('compte-rendu').start - 1, scale);
    expect(ids).toEqual([]);
    layer.advance(stepBounds('compte-rendu').start + 1, scale);
    layer.advance(stepBounds('compte-rendu').start + 500, scale);
    expect(ids).toEqual(['a']);
  });

  it('reports a combat that holds its final pose with it, cut or too big', () => {
    const layer = new CombatLayer();
    const ids = reported(layer);
    layer.play(combat('big', 13), null, at, 0, 0);
    layer.advance(0, scale);
    expect(ids).toEqual(['big']);
  });

  it('reports nothing past the floor, nor for a scene a replay cleared', () => {
    const layer = new CombatLayer();
    const ids = reported(layer);
    layer.play(combat('far', 13), null, at, 0, 0);
    layer.advance(0, () => 0);
    layer.play(combat('gone'), null, at, 0, 0);
    layer.clear();
    layer.advance(REPLAY_MS, scale);
    expect(ids).toEqual([]);
  });

  it('knows a combat shown from the first image it stands at a scale above zero', () => {
    const layer = new CombatLayer();
    const told: string[] = [];
    layer.onShown = (id) => told.push(id);
    layer.play(combat('a'), null, at, 0, 0);
    layer.wait('w', at, 0);
    expect(layer.shown('a')).toBe(false);
    layer.advance(0, () => 0);
    expect(layer.shown('a')).toBe(false);
    layer.advance(10, scale);
    layer.advance(20, scale);
    expect(layer.shown('a')).toBe(true);
    expect(layer.shown('w')).toBe(false);
    expect(told).toEqual(['a']);
  });
});
