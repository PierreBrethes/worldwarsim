import { describe, expect, it } from 'vitest';
import { fillGeometry, lineGeometry } from './atlas-geometry';

const frame = { centerX: 200, centerY: 104 };
type Point = readonly [number, number, number];

describe('fillGeometry', () => {
  // A 4 × 4 square of land around a 2 × 2 lake, each ring wound as the atlas winds it.
  const outer = Float32Array.of(200, 104, 204, 104, 204, 108, 200, 108);
  const lake = Float32Array.of(201, 105, 201, 107, 203, 107, 203, 105);
  const geometry = fillGeometry([{ outer, holes: [lake] }], frame, 0.08);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  const triangles = Array.from(
    { length: index.count / 3 },
    (_, t) =>
      ([0, 1, 2] as const).map((k) => {
        const v = index.getX(3 * t + k);
        return [position.getX(v), position.getY(v), position.getZ(v)] as const;
      }) as unknown as readonly [Point, Point, Point],
  );
  /** Twice the area seen from above, positive when the triangle faces up. */
  const upward = ([a, b, c]: (typeof triangles)[number]) =>
    (c[0] - a[0]) * (b[2] - a[2]) - (b[0] - a[0]) * (c[2] - a[2]);

  it('covers the land and leaves the lake open', () => {
    expect(
      triangles.reduce((sum, triangle) => sum + Math.abs(upward(triangle)) / 2, 0),
    ).toBeCloseTo(12);
  });

  it('faces the sky, on the sheet, centred on the board', () => {
    expect(triangles.every((triangle) => upward(triangle) > 0)).toBe(true);
    expect(
      triangles
        .flat()
        .every(([x, y, z]) => Math.abs(y - 0.08) < 1e-6 && x >= 0 && x <= 4 && z >= 0 && z <= 4),
    ).toBe(true);
  });
});

describe('lineGeometry', () => {
  it('lays each segment of a line as a pair of points', () => {
    expect([
      ...lineGeometry([{ points: Float32Array.of(200, 104, 201, 104, 201, 106) }], frame, 1),
    ]).toEqual([0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 2]);
  });
});
