import { describe, expect, it } from 'vitest';
import { footprintOf, type Loop } from './footprint';

/** Two triangles covering an axis-aligned rectangle, seen from above (x, z). */
const rect = (x0: number, z0: number, x1: number, z1: number): number[] => [
  ...[x0, z0, x1, z0, x1, z1],
  ...[x0, z0, x1, z1, x0, z1],
];

/** A vertical wall seen from above: a triangle with no area, only an edge. */
const wall = (x0: number, z0: number, x1: number, z1: number): number[] => [
  ...[x0, z0, x1, z1, x1, z1],
];

const area = (loop: Loop): number =>
  Math.abs(
    loop.reduce((sum, [x, z], k) => {
      const [nx, nz] = loop[(k + 1) % loop.length]!;
      return sum + x * nz - nx * z;
    }, 0) / 2,
  );

describe('footprintOf', () => {
  it('keeps a building in L as an L: six corners, the area of the L', () => {
    const loops = footprintOf([...rect(0, 0, 4, 1), ...rect(0, 1, 1, 4)]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
    // 4 + 3, not the 10.5 of its convex hull.
    expect(area(loops[0]!)).toBeGreaterThan(6.3);
    expect(area(loops[0]!)).toBeLessThan(7.7);
  });

  it('fills what four walls enclose, though walls have no area from above', () => {
    const loops = footprintOf([
      ...wall(0, 0, 3, 0),
      ...wall(3, 0, 3, 2),
      ...wall(3, 2, 0, 2),
      ...wall(0, 2, 0, 0),
    ]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(area(loops[0]!)).toBeGreaterThan(5.4);
    expect(area(loops[0]!)).toBeLessThan(6.6);
  });

  it('draws two buildings apart as two outlines', () => {
    expect(footprintOf([...rect(0, 0, 1, 1), ...rect(3, 0, 4, 1)])).toHaveLength(2);
  });

  it('keeps two buildings touching by a corner as two outlines, not a figure eight', () => {
    const loops = footprintOf([...rect(0, 0, 1, 1), ...rect(1.25, 1.25, 2, 2)], 8);
    expect(loops).toHaveLength(2);
    for (const loop of loops) expect(area(loop)).toBeLessThan(1.6);
  });

  it('has nothing to draw for nothing', () => {
    expect(footprintOf([])).toEqual([]);
  });
});
