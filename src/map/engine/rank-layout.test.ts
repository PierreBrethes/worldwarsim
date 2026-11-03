import { describe, expect, it } from 'vitest';
import { rankLayout } from './rank-layout';

const pile = (width: number, depth = width) => ({ width, depth });

describe('rankLayout', () => {
  it('centres piles abreast on the marker', () => {
    const [a, b] = rankLayout([pile(6), pile(4)], 30);
    expect(a!.x).toBeCloseTo(-2, 9);
    expect(b!.x).toBeCloseTo(3, 9);
    expect(a!.z).toBeCloseTo(3, 9);
  });

  it('opens the next row, a depth further in, rather than leave the rectangle', () => {
    const placed = rankLayout([pile(12), pile(12), pile(12)], 30);
    expect(placed[2]!.z).toBeGreaterThan(placed[0]!.z + 11);
    for (const { x } of placed.slice(0, 2)) expect(Math.abs(x) + 6).toBeLessThanOrEqual(15);
    expect(placed[2]!.x).toBeCloseTo(0, 9);
  });

  it('stands a pile wider than the rectangle alone in its row', () => {
    const placed = rankLayout([pile(40), pile(5)], 30);
    expect(placed[0]!.x).toBeCloseTo(0, 9);
    expect(placed[1]!.z).toBeGreaterThan(placed[0]!.z);
  });
});
