import { describe, expect, it } from 'vitest';
import { LABEL_EXPANDED_DISTANCE, plateScale } from './labels';

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
