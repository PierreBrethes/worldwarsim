import { describe, expect, it } from 'vitest';
import { decodeAtlas, type AtlasFile } from './atlas';
import { contourLines } from './contours';

/**
 * Two unit squares side by side, W and E, sharing the arc x = 1; the sea all round.
 *
 *   (0,1)───(1,1)───(2,1)
 *     │  W    │   E   │
 *   (0,0)───(1,0)───(2,0)
 */
const FILE: AtlasFile = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [0, 0] },
  objects: {
    regions: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[0, 1]], id: 'W', properties: { country: 'X', name: 'W' } },
        { type: 'Polygon', arcs: [[~0, 2]], id: 'E', properties: { country: 'X', name: 'E' } },
      ],
    },
  },
  // Absolute points, written as deltas.
  arcs: [
    [
      [1, 0],
      [0, 1],
    ],
    [
      [1, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ],
    [
      [1, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
    ],
  ],
};
const atlas = decodeAtlas(FILE);
const area = (line: Float32Array) => {
  let sum = 0;
  for (let i = 2; i < line.length; i += 2)
    sum += line[i - 2]! * line[i + 1]! - line[i]! * line[i - 1]!;
  return sum / 2;
};
const points = (line: Float32Array) => line.length / 2;

describe('contourLines', () => {
  it('draws one closed loop on the coast round a territory, and a thin line between its own regions', () => {
    const { outlines, inner } = contourLines(atlas, () => 'fr', 'far');
    const loops = outlines.get('fr')!;
    expect(loops).toHaveLength(1);
    expect(loops[0]!.inset).toBe(false);
    expect(points(loops[0]!.points)).toBe(7);
    expect(loops[0]!.points.slice(0, 2)).toEqual(loops[0]!.points.slice(-2));
    expect(inner).toHaveLength(1);
  });

  it('keeps two neighbouring territories side by side on their shared border, each set back at home', () => {
    const { outlines, inner } = contourLines(atlas, (id) => id, 'far');
    for (const territory of ['W', 'E']) {
      const shared = outlines.get(territory)!.filter(({ inset }) => inset);
      expect(shared).toHaveLength(1);
      expect(points(shared[0]!.points)).toBe(2);
      expect(outlines.get(territory)!.filter(({ inset }) => !inset)).toHaveLength(1);
    }
    expect(inner).toHaveLength(0);
  });

  it('lays the line on the border itself where the other side is held by no one', () => {
    const { outlines } = contourLines(atlas, (id) => (id === 'W' ? 'fr' : undefined), 'far');
    expect([...outlines.keys()]).toEqual(['fr']);
    expect(outlines.get('fr')!.map(({ inset, points: line }) => [inset, points(line)])).toEqual([
      [false, 5],
    ]);
  });

  it('keeps the inside of every territory on the left, so all the dashes turn one way', () => {
    const { outlines } = contourLines(atlas, (id) => id, 'far');
    // Each territory's lines, laid end to end, close round it: the sign of their area is its side.
    const sides = ['W', 'E'].map((territory) =>
      Math.sign(outlines.get(territory)!.reduce((sum, { points: line }) => sum + area(line), 0)),
    );
    expect(sides).toEqual([1, 1]);
  });
});
