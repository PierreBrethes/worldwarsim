import { describe, expect, it } from 'vitest';
import { crossesAntimeridian, distanceKm, shortestLongitudeGap } from './geo';

const PARIS = [2.29, 47.19] as const;
const TOKYO = [138.65, 36.12] as const;
const NEW_ZEALAND = [169.28, -45.13] as const;
const UNITED_STATES = [-101.18, 39.05] as const;

describe('longitude wraps', () => {
  it('always takes the shortest way around', () => {
    expect(shortestLongitudeGap(169.28, -101.18)).toBeCloseTo(89.54, 2);
    expect(shortestLongitudeGap(-101.18, 169.28)).toBeCloseTo(-89.54, 2);
  });

  it('makes the Pacific shorter than the route through Eurasia', () => {
    const viaPacific = distanceKm(NEW_ZEALAND, UNITED_STATES);
    const withoutWrapping = 111 * Math.abs(NEW_ZEALAND[0] - UNITED_STATES[0]);
    expect(viaPacific).toBeLessThan(withoutWrapping);
  });

  it('flags routes that cross the antimeridian', () => {
    expect(crossesAntimeridian(NEW_ZEALAND, UNITED_STATES)).toBe(true);
    expect(crossesAntimeridian(PARIS, TOKYO)).toBe(false);
  });
});

describe('distances', () => {
  it('stays within the expected order of magnitude', () => {
    expect(distanceKm(PARIS, TOKYO)).toBeGreaterThan(9000);
    expect(distanceKm(PARIS, TOKYO)).toBeLessThan(11000);
  });
});
