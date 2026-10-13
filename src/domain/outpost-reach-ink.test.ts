import { describe, expect, it } from 'vitest';
import { raisedReaches } from './outpost-reach-ink';

const point = (id: string, reachKm: number, standsAt: number | null) => ({
  id,
  lonLat: [2, 49] as [number, number],
  reachKm,
  standsAt,
});

describe('raisedReaches', () => {
  it('traces a point that has just stood up, at its reach', () => {
    expect(raisedReaches([point('a', 120, 500)], [point('a', 120, null)])).toEqual([
      { at: [2, 49], km: 120 },
    ]);
  });

  it('traces a standing point whose reach grew, at the larger reach', () => {
    expect(raisedReaches([point('a', 120, null)], [point('a', 180, null)])).toEqual([
      { at: [2, 49], km: 180 },
    ]);
  });

  it('traces nothing for what was already there, still under works, or just appeared', () => {
    expect(raisedReaches([point('a', 120, null)], [point('a', 120, null)])).toEqual([]);
    expect(raisedReaches([point('a', 120, 500)], [point('a', 120, 500)])).toEqual([]);
    expect(raisedReaches([], [point('a', 120, null)])).toEqual([]);
  });
});
