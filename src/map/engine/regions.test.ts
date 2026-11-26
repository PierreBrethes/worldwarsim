import { describe, expect, it } from 'vitest';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE, regionsShare, washShare } from './regions';

describe('washShare', () => {
  it('is nil up close, where the regions are whole', () => {
    expect(washShare(REGIONS_FULL_DISTANCE)).toBe(0);
    expect(washShare(10)).toBe(0);
  });

  it('is full far out, where the regions are gone', () => {
    expect(washShare(REGIONS_GONE_DISTANCE)).toBe(1);
    expect(washShare(300)).toBe(1);
  });

  it('complements the regions’ fade, linearly, across the ramp', () => {
    const middle = (REGIONS_FULL_DISTANCE + REGIONS_GONE_DISTANCE) / 2;
    expect(washShare(middle)).toBeCloseTo(0.5);
    for (const distance of [35, 45, 53, 60])
      expect(washShare(distance) + regionsShare(distance)).toBeCloseTo(1);
  });
});
