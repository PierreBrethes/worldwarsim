import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, type MeshBasicMaterial } from 'three';
import { inkAnnotation } from './annotations';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({}) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    },
  });
});

const inkOf = (object: ReturnType<typeof inkAnnotation>['object']) => {
  let opacity = NaN;
  object.traverse((part) => {
    if (part instanceof Mesh) opacity = (part.material as MeshBasicMaterial).opacity;
  });
  return opacity;
};

describe('inkAnnotation (F2)', () => {
  it('lies flat on the board, where a block stood', () => {
    const { object } = inkAnnotation('land', 0, null);
    const box = new Box3().setFromObject(object);
    expect(box.max.y - box.min.y).toBeLessThan(1e-3);
    expect(box.max.x - box.min.x).toBeGreaterThan(0);
  });

  it('pales with the age of the survey', () => {
    expect(inkOf(inkAnnotation('sea', 0, null).object)).toBe(1);
    expect(inkOf(inkAnnotation('sea', 0, 12 * 60).object)).toBeLessThan(1);
  });
});
