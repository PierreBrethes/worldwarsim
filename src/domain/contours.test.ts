import { describe, expect, it } from 'vitest';
import { contourLines } from './contours';

// Two unit squares side by side, sharing the edge x = 1 (y down, as in `world.json`).
const west = {
  id: 'W',
  rings: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ] as const,
  ],
};
const east = {
  id: 'E',
  rings: [
    [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 0],
    ] as const,
  ],
};

describe('contourLines', () => {
  it('draws one closed loop round a block, and a thin line between its own regions', () => {
    const { outlines, inner } = contourLines([west, east], () => 'fr');
    const loops = outlines.get('fr')!;
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(7);
    expect(loops[0]![0]).toEqual(loops[0]!.at(-1));
    expect(inner).toHaveLength(1);
  });

  it('gives each of two nations its own line along their border', () => {
    const { outlines, inner } = contourLines([west, east], (id) => id);
    expect(outlines.get('W')!.flat()).toHaveLength(5);
    expect(outlines.get('E')!.flat()).toHaveLength(5);
    expect(inner).toHaveLength(0);
  });

  it('keeps every block turning the same way, whichever way its rings were baked', () => {
    const reversed = { id: 'E', rings: [[...east.rings[0]!].reverse()] };
    const area = (loop: ReadonlyArray<readonly [number, number]>) =>
      loop.slice(1).reduce((sum, [x, y], i) => sum + loop[i]![0] * y - x * loop[i]![1], 0);
    const { outlines } = contourLines([west, reversed], (id) => id);
    expect(Math.sign(area(outlines.get('E')![0]!))).toBe(Math.sign(area(outlines.get('W')![0]!)));
  });

  it('leaves a region out of every block without a line', () => {
    const { outlines } = contourLines([west, east], (id) => (id === 'W' ? 'fr' : undefined));
    expect([...outlines.keys()]).toEqual(['fr']);
    expect(outlines.get('fr')![0]).toHaveLength(5);
  });
});
