import { describe, expect, it } from 'vitest';
import { RESOURCES } from '@/domain/ids';
import {
  HEAP_SHAPES,
  heapGeometry,
  heapHeight,
  heapMeshOf,
  heapPieces,
  type HeapShape,
} from './yard-heaps';

const SHAPES: ReadonlyArray<HeapShape> = ['mound', 'barrels', 'sacks'];

/** **The heap in a yard** (#707): four sizes, read at a glance, none at 0. */
describe('the heap in a yard', () => {
  it('lies in a mound of ore and coal, in barrels of oil, in sacks of food', () => {
    expect(HEAP_SHAPES.steel).toBe('mound');
    expect(HEAP_SHAPES.coal).toBe('mound');
    expect(HEAP_SHAPES.oil).toBe('barrels');
    expect(HEAP_SHAPES.food).toBe('sacks');
  });

  it('draws nothing at 0, and grows at each stack, higher or wider, up to 4', () => {
    for (const shape of SHAPES) {
      expect(heapPieces(shape, 0)).toEqual([]);
      expect(heapGeometry(shape, 0)).toBeNull();
      const sizes = [1, 2, 3, 4].map((stack) => {
        const geometry = heapGeometry(shape, stack)!;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        return {
          height: heapHeight(shape, stack),
          ground: (box.max.x - box.min.x) * (box.max.z - box.min.z),
        };
      });
      for (let k = 1; k < sizes.length; k++) {
        const [was, now] = [sizes[k - 1]!, sizes[k]!];
        expect(now.height > was.height || now.ground > was.ground, `${shape} ${k + 1}`).toBe(true);
      }
    }
  });

  it('stands within its yard spot, its foot on the yard, at its full stack too', () => {
    for (const shape of SHAPES) {
      const geometry = heapGeometry(shape, 4)!;
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox!;
      expect(min.y).toBeCloseTo(0, 6);
      expect(max.y).toBeCloseTo(heapHeight(shape, 4), 6);
      for (const reach of [min.x, max.x, min.z, max.z]) expect(Math.abs(reach)).toBeLessThan(9);
    }
  });

  it('shares one geometry and one ink by shape, stack and resource: one draw call a heap', () => {
    for (const resource of RESOURCES) {
      const [a, b] = [heapMeshOf(resource, 3)!, heapMeshOf(resource, 3)!];
      expect(a.geometry).toBe(b.geometry);
      expect(a.material).toBe(b.material);
    }
    expect(heapMeshOf('steel', 0)).toBeNull();
  });
});
