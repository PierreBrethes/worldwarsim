import { describe, expect, it } from 'vitest';
import { arrivalFacing, cameFrom } from './pile-facing';

/** A road east, then north: a bend at [2, 0]. */
const BENT = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [2, 2],
] as Array<[number, number]>;

describe('cameFrom (#362)', () => {
  it('is the last point of the route that is not its end', () => {
    expect(cameFrom(BENT)).toEqual([2, 1]);
  });

  it('is the last point before a stop on the way, not after it', () => {
    expect(cameFrom(BENT, [1.5, 0])).toEqual([1, 0]);
    expect(cameFrom(BENT, [2, 0.5])).toEqual([2, 0]);
  });

  it('is nothing on a route that never left its point', () => {
    expect(cameFrom([[3, 3]])).toBeUndefined();
  });
});

describe('arrivalFacing', () => {
  it('faces where a column stopped on the way was going, not the end of its route', () => {
    // Stopped going east, before the bend north.
    expect(arrivalFacing(BENT, [], [1.5, 0])).toBeCloseTo(90, 0);
    expect(arrivalFacing(BENT, [])).toBeCloseTo(0, 0);
  });
});
