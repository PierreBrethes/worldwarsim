import { describe, expect, it } from 'vitest';
import { outpostReachKm } from '../../convex/constants';
import { raisedReaches } from './outpost-reach-ink';

const point = (id: string, level: number, standsAt: number | null) => ({
  id,
  lonLat: [2, 49] as [number, number],
  level,
  standsAt,
});

describe('raisedReaches', () => {
  it('traces a point that has just stood up, at its reach', () => {
    expect(raisedReaches([point('a', 1, 500)], [point('a', 1, null)])).toEqual([
      { at: [2, 49], km: outpostReachKm(1) },
    ]);
  });

  it('traces a standing point whose level went up, at the larger reach', () => {
    expect(raisedReaches([point('a', 1, null)], [point('a', 2, null)])).toEqual([
      { at: [2, 49], km: outpostReachKm(2) },
    ]);
  });

  it('traces nothing for what was already there, still under works, or just appeared', () => {
    expect(raisedReaches([point('a', 1, null)], [point('a', 1, null)])).toEqual([]);
    expect(raisedReaches([point('a', 1, 500)], [point('a', 1, 500)])).toEqual([]);
    expect(raisedReaches([], [point('a', 1, null)])).toEqual([]);
  });
});
