import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import { nearestOutpostKm, withinReach } from './outposts';

const BUCHAREST: LonLat = [26.1, 44.43];
const PRAHOVA: LonLat = [26.01, 45.1];
const PARIS: LonLat = [2.27, 48.9];

describe('outpost reach', () => {
  it('has none without an outpost', () => {
    expect(nearestOutpostKm(PRAHOVA, [])).toBeNull();
    expect(withinReach(PRAHOVA, [], 400)).toBe(false);
  });

  it('measures the nearest one, not the first', () => {
    const km = nearestOutpostKm(PRAHOVA, [{ point: PARIS }, { point: BUCHAREST }]);
    expect(km).toBeCloseTo(75, 0);
  });

  /** The same radius covers a handful of Romanian counties and no French department from
   *  Paris: the count varies with the cutting, the kilometres do not. */
  it('opens a radius, not a ring of neighbours', () => {
    const outposts = [{ point: BUCHAREST }];
    expect(withinReach(PRAHOVA, outposts, 400)).toBe(true);
    expect(withinReach(PARIS, outposts, 400)).toBe(false);
  });
});
