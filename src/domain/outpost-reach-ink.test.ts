import { describe, expect, it } from 'vitest';
import { leftReaches, raisedReaches } from './outpost-reach-ink';

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

describe('leftReaches', () => {
  it('names the area of a point the view lost after its dismantling was confirmed (#340)', () => {
    expect(
      leftReaches(
        [point('a', 120, null), point('b', 180, null)],
        [point('b', 180, null)],
        new Set(['a']),
      ),
    ).toEqual([{ at: [2, 49], km: 120 }]);
  });

  it('names nothing for a site still under works: it never coloured an area', () => {
    expect(leftReaches([point('a', 120, 500)], [], new Set(['a']))).toEqual([]);
  });

  it('names nothing for a point the view still serves, or one nobody dismantled', () => {
    expect(leftReaches([point('a', 120, null)], [point('a', 120, null)], new Set(['a']))).toEqual(
      [],
    );
    expect(leftReaches([point('a', 120, null)], [], new Set())).toEqual([]);
  });
});
