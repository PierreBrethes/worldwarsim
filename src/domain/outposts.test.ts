import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import { nearestOutpostKm, reachingOutpost, withinReach } from './outposts';

const BUCHAREST: LonLat = [26.1, 44.43];
const PRAHOVA: LonLat = [26.01, 45.1];
const PARIS: LonLat = [2.27, 48.9];

describe('outpost reach', () => {
  it('has none without an outpost', () => {
    expect(nearestOutpostKm(PRAHOVA, [])).toBeNull();
    expect(withinReach(PRAHOVA, [])).toBe(false);
  });

  it('measures the nearest one, not the first', () => {
    const km = nearestOutpostKm(PRAHOVA, [{ point: PARIS }, { point: BUCHAREST }]);
    expect(km).toBeCloseTo(75, 0);
  });

  /** The same radius covers a handful of Romanian counties and no French department from
   *  Paris: the count varies with the cutting, the kilometres do not. */
  it('opens a radius, not a ring of neighbours', () => {
    const outposts = [{ point: BUCHAREST, reachKm: 120 }];
    expect(withinReach(PRAHOVA, outposts)).toBe(true);
    expect(withinReach(PARIS, outposts)).toBe(false);
  });

  /**
   * **Chaque point porte son rayon** depuis qu'il suit son niveau (31/08) : le plus proche n'est
   * plus forcément celui qui couvre, et c'est celui qui couvre qui répond.
   */
  it('answers with the point that reaches, never with the nearest that does not', () => {
    const short = { point: PARIS, reachKm: 120, name: 'paris' };
    const long = { point: BUCHAREST, reachKm: 240, name: 'bucarest' };
    expect(reachingOutpost(PRAHOVA, [short, long])?.nearest.name).toBe('bucarest');
    expect(reachingOutpost(PRAHOVA, [{ ...long, reachKm: 60 }])).toBeNull();
  });
});
