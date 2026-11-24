import { describe, expect, it } from 'vitest';
import { nightOfAltitude, subsolarPoint, sunAltitude } from './daylight';
import type { LonLat } from './geo';
import { lookoutBeamStrength } from './lookout-beam';

const PARIS: LonLat = [2.35, 48.86];
// Équinoxe : le soleil est au zénith de 0°/0° à midi UTC.
const NOON = Date.UTC(2026, 2, 20, 12);
const HOUR_MS = 3_600_000;

describe('lookoutBeamStrength', () => {
  it('is dark by day, full once the twilight is past, whatever the lookout', () => {
    expect(lookoutBeamStrength(20, PARIS, NOON)).toBe(0);
    expect(lookoutBeamStrength(20, PARIS, NOON + 12 * HOUR_MS)).toBe(1);
  });

  it('rises through the twilight, on the slope of the city lights', () => {
    const at = (hours: number) => lookoutBeamStrength(20, PARIS, NOON + hours * HOUR_MS);
    const strengths = Array.from({ length: 15 }, (_, k) => 5 + k / 2).map(at);
    expect(strengths.some((s) => s > 0 && s < 1)).toBe(true);
    expect([...strengths].sort((a, b) => a - b)).toEqual(strengths);
    const instant = NOON + 6.5 * HOUR_MS;
    const dark = nightOfAltitude(sunAltitude(subsolarPoint(instant), PARIS));
    expect(dark).toBeGreaterThan(0.3);
    expect(lookoutBeamStrength(20, PARIS, instant)).toBeCloseTo((dark - 0.3) / 0.5, 10);
  });

  it('stays dark for a point that does not see (no coal), night or not', () => {
    expect(lookoutBeamStrength(null, PARIS, NOON + 12 * HOUR_MS)).toBe(0);
  });

  it('is the night of the place of the outpost, not of the eye', () => {
    const midnight = NOON + 12 * HOUR_MS;
    expect(lookoutBeamStrength(20, PARIS, midnight)).toBe(1);
    expect(lookoutBeamStrength(20, [177, 0], midnight)).toBe(0);
  });
});
