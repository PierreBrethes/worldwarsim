import { describe, expect, it } from 'vitest';
import type { LonLat } from '../src/domain/geo';
import { homeCountryOf, regionFacts } from './regions';
import { hostAtPoint } from './routes';

/**
 * The empty string is the open sea and nothing else. It used to mean "no playable nation here"
 * as well, which fused two facts a hundred and fifty-five countries wide apart — and every rule
 * of fiche 03 that keys on a host reads this string.
 */
describe('the country hosting a point', () => {
  const RIYADH: LonLat = [46.72, 24.63];
  const HIGH_SEA: LonLat = [-30, 40]; // mid-Atlantic, no ring within a thousand kilometres
  const PARIS: LonLat = [2.35, 48.86];

  it('names a country nobody plays', () => {
    expect(hostAtPoint(RIYADH)).toBe('SAU');
  });

  it('answers the empty string on the open sea, and there only', () => {
    expect(hostAtPoint(HIGH_SEA)).toBe('');
  });

  it('answers a home country the same code every other reader uses', () => {
    expect(hostAtPoint(PARIS)).toBe('FRA');
    expect(hostAtPoint(PARIS)).toBe(regionFacts('FRA-5333')!.country);
    expect(hostAtPoint(PARIS)).toBe(homeCountryOf('france'));
  });

  /**
   * The intention, graven: Arabia and Romania are two hosts. The decreasing yield per host, the
   * finite trade capacity and the expulsion of fiche 03 are all keyed on this — none of them can
   * be written while every neutral answers the same string.
   */
  it('tells two neutral countries apart', () => {
    const PRAHOVA: LonLat = [25.2, 44.6];
    expect(hostAtPoint(PRAHOVA)).toBe('ROU');
    expect(hostAtPoint(PRAHOVA)).not.toBe(hostAtPoint(RIYADH));
  });
});
