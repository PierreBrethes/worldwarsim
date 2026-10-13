import { describe, expect, it } from 'vitest';
import { CLOSE_GONE_DISTANCE, closeShare } from './labels';
import { REGIONS_FULL_DISTANCE } from './regions';
import { LABEL_EXPANDED_DISTANCE, plateScale } from './labels';

describe('closeShare', () => {
  it('shows the close layer whole once the eye is on a country', () => {
    expect(closeShare(11)).toBe(1);
  });

  it('keeps it off a continent seen whole, though the regions are already drawn there', () => {
    expect(closeShare(24)).toBe(0);
    expect(CLOSE_GONE_DISTANCE).toBeLessThan(REGIONS_FULL_DISTANCE);
  });

  it('fades between the two', () => {
    const middle = closeShare(17);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
  });
});

describe('plateScale', () => {
  it('keeps the full plate while the label is expanded', () => {
    expect(plateScale(10)).toBe(1);
    expect(plateScale(LABEL_EXPANDED_DISTANCE)).toBe(1);
  });

  it('shrinks the plate of a folded building the farther the camera stands', () => {
    expect(plateScale(260)).toBeLessThan(1);
    expect(plateScale(300)).toBeLessThan(plateScale(260));
  });

  it('never makes a building vanish', () => {
    expect(plateScale(10_000)).toBeGreaterThan(0.3);
  });
});
