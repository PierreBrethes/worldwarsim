import { describe, expect, it } from 'vitest';
import type { DisplayedRegion } from '@/domain/world';
import { contains, prepare } from './regions';

const square = (x: number, y: number, side: number) =>
  [
    [x, y],
    [x + side, y],
    [x + side, y + side],
    [x, y + side],
  ] as const;

const archipelago: DisplayedRegion = {
  id: 'T-1',
  country: 'T',
  name: 'Test',
  type: 'plain',
  rings: [square(0, 0, 10), square(3, 3, 4), square(40, 0, 5), square(0, 40, 5)],
};

const wholeRing = (region: DisplayedRegion, x: number, y: number) => {
  let inside = false;
  for (const ring of region.rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
};

describe('contains', () => {
  it('answers like the scan of every ring, hole and far islands included', () => {
    const prepared = prepare(archipelago);
    for (let x = -3; x <= 50; x += 0.7)
      for (let y = -3; y <= 50; y += 0.7)
        expect(contains(prepared, x, y), `${x},${y}`).toBe(wholeRing(archipelago, x, y));
  });

  it('keeps one box per ring and the box of them all', () => {
    const { ringBoxes, box } = prepare(archipelago);
    expect(ringBoxes).toHaveLength(4);
    expect(box).toEqual([0, 0, 45, 45]);
  });
});
