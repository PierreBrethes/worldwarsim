import { describe, expect, it } from 'vitest';
import { cratersAround } from './battle-traces';

describe('cratersAround (#642)', () => {
  it('pose le premier cratère au point, les autres autour, au même endroit d’une vue à l’autre', () => {
    const trace = { id: 'engagement-1', craters: 5 };
    const craters = cratersAround(trace);
    expect(craters).toHaveLength(5);
    expect(craters[0]).toMatchObject({ dx: 0, dz: 0, size: 1 });
    for (const { dx, dz, size } of craters.slice(1)) {
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(1.15);
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(2.2);
      expect(size).toBeLessThan(1.1);
    }
    expect(cratersAround(trace)).toEqual(craters);
    expect(cratersAround({ id: 'engagement-2', craters: 5 })).not.toEqual(craters);
  });
});
