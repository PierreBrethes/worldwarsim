import { describe, expect, it } from 'vitest';
import { ringsLeft } from './unplayed';

describe('ringsLeft (#277)', () => {
  it('rings what reduced motion lays at once, and what full motion could not play', () => {
    expect(ringsLeft('reduced', { veiled: false, unplayable: false })).toBe(true);
    expect(ringsLeft('full', { veiled: false, unplayable: true })).toBe(true);
    expect(ringsLeft('full', { veiled: false, unplayable: false })).toBe(false);
    expect(ringsLeft('off', { veiled: false, unplayable: true })).toBe(false);
  });

  it('rings nothing under a combat at the point, at any setting', () => {
    for (const motion of ['full', 'reduced', 'off'] as const)
      for (const unplayable of [false, true])
        expect(ringsLeft(motion, { veiled: true, unplayable })).toBe(false);
  });
});
