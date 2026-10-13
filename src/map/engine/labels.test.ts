import { describe, expect, it } from 'vitest';
import { closeShare } from './labels';
import { REGIONS_FULL_DISTANCE } from './regions';

describe('closeShare', () => {
  it('shows the close layer whole once the eye is on a country', () => {
    expect(closeShare(11)).toBe(1);
  });

  it('keeps it off a continent seen whole, though the regions are already drawn there', () => {
    expect(closeShare(24)).toBe(0);
    expect(24).toBeLessThan(REGIONS_FULL_DISTANCE);
  });

  it('fades between the two', () => {
    const middle = closeShare(17);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });
});
