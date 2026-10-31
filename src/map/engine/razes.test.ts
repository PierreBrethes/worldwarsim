import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { MAX_PLAYING } from './sequences';
import { RAZE_MS, RAZE_RING_MS } from './timelines/raze';
import { RazeLayer } from './razes';

beforeAll(() => {
  // The dust's puff is painted on a canvas: this file has no DOM.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
  });
});

const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const drawn = (material = new MeshStandardMaterial({ color: '#c8b48c' })) => ({
  parts: [{ geometry, material }],
  matrix: new Matrix4().makeTranslation(3, 0, 2),
  box: new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5)),
});
const heightOf = (layer: RazeLayer) => {
  layer.group.updateMatrixWorld(true);
  const box = new Box3();
  layer.group.traverse((node) => {
    if ((node as { isMesh?: boolean }).isMesh && node.visible && node.userData.building)
      box.expandByObject(node);
  });
  return box.isEmpty() ? 0 : box.max.y - box.min.y;
};

describe('RazeLayer', () => {
  it('falls on itself where it stood, blackening, and is gone with its footprint by 3.2 s', () => {
    const source = new MeshStandardMaterial({ color: '#c8b48c' });
    const layer = new RazeLayer();
    layer.play(drawn(source), 0);
    expect(layer.active).toBe(true);
    layer.advance(0);
    expect(heightOf(layer)).toBeCloseTo(1);
    layer.advance(1200);
    expect(heightOf(layer)).toBeCloseTo(0.12, 2);
    // Its own copy blackens: every other maquette of its model keeps its colour.
    expect(source.color.getHexString()).toBe('c8b48c');
    let worn: MeshStandardMaterial | undefined;
    layer.group.traverse((node) => {
      if (node.userData.building)
        worn = (node as unknown as { material: MeshStandardMaterial }).material;
    });
    // Toward its charred colour, a third of its own: 0.7 of the way at 1.2 s.
    expect(worn!.color.r).toBeCloseTo(source.color.r * 0.51, 3);
    layer.advance(RAZE_MS);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.active).toBe(false);
  });

  it('plays at most MAX_PLAYING at once: beyond, the maquette goes as it did', () => {
    const layer = new RazeLayer();
    for (let k = 0; k < MAX_PLAYING + 2; k++) layer.play(drawn(), 0);
    expect(layer.group.children).toHaveLength(MAX_PLAYING);
  });

  it('opens a ring of ink in its place when reduced, and plays nothing when cut', () => {
    const reduced = new RazeLayer();
    reduced.motion = 'reduced';
    reduced.play(drawn(), 0);
    reduced.advance(0);
    expect(heightOf(reduced)).toBe(0);
    expect(reduced.group.children).toHaveLength(1);
    reduced.advance(RAZE_RING_MS);
    expect(reduced.group.children).toHaveLength(0);
    const cut = new RazeLayer();
    cut.motion = 'off';
    cut.play(drawn(), 0);
    expect(cut.group.children).toHaveLength(0);
    expect(cut.active).toBe(false);
  });
});
