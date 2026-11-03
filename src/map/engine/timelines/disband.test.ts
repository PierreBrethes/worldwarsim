import { describe, expect, it } from 'vitest';
import { crownWayOf } from './disband';

describe('crownWayOf (#277, U)', () => {
  const way = (to: readonly [number, number]) =>
    crownWayOf({
      center: [-1, 0],
      from: [0, 0],
      front: [0, 1],
      to,
      span: 1,
      rank: 2,
      infantry: false,
    });

  it('leaves its rank facing the front, and stands at its place facing away from the point', () => {
    const { ms, start, at } = way([3, 0]);
    expect(start).toBe(320);
    expect(at(start).at).toEqual([0, 0]);
    expect(at(start).heading).toBeCloseTo(0, 1);
    const end = at(start + ms);
    expect(end.at[0]).toBeCloseTo(3, 5);
    expect(end.at[1]).toBeCloseTo(0, 5);
    expect(end.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  it('walks at a pace and a half of its span a second, between 1.2 and 2.6 s', () => {
    expect(way([0.5, 0]).ms).toBe(1200);
    expect(way([30, 0]).ms).toBe(2600);
    const { ms } = way([2.5, 2.5]);
    expect(ms).toBeGreaterThan(1200);
    expect(ms).toBeLessThan(2600);
  });
});
