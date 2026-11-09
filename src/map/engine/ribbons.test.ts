import { describe, expect, it } from 'vitest';
import {
  PerspectiveCamera,
  Scene,
  type BufferAttribute,
  type BufferGeometry,
  type Mesh,
  type Vector2,
  type WebGLRenderer,
} from 'three';
import type { World } from '@/domain/world';
import { WorldFrame } from './frame';
import { RibbonLayer, WIND_RIBBONS } from './ribbons';

const world: World = {
  sphere: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
  outline: Array.from({ length: 181 }, (_, k) => [k - 90, 0, 100, ((180 - k) / 180) * 50] as const),
  countries: [],
} as unknown as World;

describe('RibbonLayer', () => {
  it('sends the renderer the vertices it draws, and no more of its buffers', () => {
    const scene = new Scene();
    const eye = new PerspectiveCamera(30, 1280 / 800, 0.5, 3000);
    eye.position.set(0, 100, 0.01);
    eye.lookAt(0, 0, 0);
    eye.updateMatrixWorld();
    const renderer = {
      getSize: (size: Vector2) => size.set(1280, 800),
    } as unknown as WebGLRenderer;
    const wind = new RibbonLayer(scene, eye, renderer, new WorldFrame(world), {
      ...WIND_RIBBONS,
      field: () => ({ u: 1, v: 0 }),
    });
    for (let step = 1; step <= 40; step++) wind.frame(step / 30, 'full');

    const { geometry } = scene.children[0] as Mesh<BufferGeometry>;
    const index = geometry.index!;
    const drawn = geometry.drawRange.count;
    expect(drawn).toBeGreaterThan(0);
    let last = 0;
    for (let k = 0; k < drawn; k++) last = Math.max(last, index.getX(k));
    for (const name of ['position', 'toward', 'halfWidth', 'alpha']) {
      const attribute = geometry.getAttribute(name) as BufferAttribute;
      const sent = (last + 1) * attribute.itemSize;
      expect(sent).toBeLessThan(attribute.array.length);
      expect(attribute.updateRanges).toEqual([{ start: 0, count: sent }]);
    }
    expect(index.updateRanges).toEqual([{ start: 0, count: drawn }]);
  });
});
