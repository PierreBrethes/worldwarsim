import { describe, expect, it } from 'vitest';
import { distanceToLand } from './coast-distance';

const mask = (rows: string[]) => ({
  width: rows[0]!.length,
  height: rows.length,
  land: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)),
});

describe('distanceToLand', () => {
  it('grows one step per cell away from a straight coast', () => {
    const { width, height, land } = mask(['#.....', '#.....', '#.....']);
    const distance = distanceToLand(land, width, height);
    expect([...distance.subarray(6, 12)]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('measures to the nearest of two lands', () => {
    const { width, height, land } = mask(['#....#', '......', '......']);
    const distance = distanceToLand(land, width, height);
    expect(distance[2]).toBe(2);
    expect(distance[4]).toBe(1);
    expect(distance[2 * width + 1]).toBeCloseTo(Math.hypot(1, 2));
  });

  it('gives land a zero distance', () => {
    const { width, height, land } = mask(['##..', '##..']);
    const distance = distanceToLand(land, width, height);
    expect([distance[0], distance[1], distance[5]]).toEqual([0, 0, 0]);
  });

  it('leaves a landless sea at an infinite distance', () => {
    const distance = distanceToLand(new Uint8Array(4), 2, 2);
    expect(distance[3]).toBe(Number.POSITIVE_INFINITY);
  });
});
