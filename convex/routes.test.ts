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

/**
 * **A host is read off the polygon, and the border is where it is tested.** Six points, three
 * pairs straddling one: proximity to a region's pole of inaccessibility got three of the six
 * wrong — Aix-la-Chapelle answered Liège, Saint-Louis answered Basel, Kehl answered the
 * Bas-Rhin — and a rule keyed on a host cannot be written on an answer that flips a border.
 *
 * They stay as the method rather than as a curiosity: whatever replaces this reading is judged
 * on a border, never on a capital.
 */
describe('a point on a border', () => {
  const CASES: ReadonlyArray<readonly [string, string, LonLat]> = [
    ['Aix-la-Chapelle', 'DEU', [6.083, 50.776]],
    ['Saint-Louis', 'FRA', [7.56, 47.59]],
    ['Bâle', 'CHE', [7.588, 47.559]],
    ['Strasbourg', 'FRA', [7.75, 48.583]],
    ['Kehl', 'DEU', [7.81, 48.573]],
    ['Genève', 'CHE', [6.143, 46.204]],
  ];

  it.each(CASES)('places %s in %s', (_name, adm0, point) => {
    expect(hostAtPoint(point)).toBe(adm0);
  });
});
