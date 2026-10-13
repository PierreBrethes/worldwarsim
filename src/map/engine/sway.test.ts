import { describe, expect, it } from 'vitest';
import { bendAround, gaitOf, MAX_BANK, swayOf } from './sway';

describe('gaitOf', () => {
  it('lets infantry walk, and every vehicle ride its medium', () => {
    expect(gaitOf('infantry')).toBeNull();
    expect(gaitOf(null)).toBeNull();
    expect(gaitOf('armor')).toBe('rolling');
    expect(gaitOf('landTransport')).toBe('rolling');
    expect(gaitOf('cargo')).toBe('hull');
    expect(gaitOf('bomber')).toBe('wing');
  });
});

describe('swayOf', () => {
  it('jolts a vehicle on the road and stills it at a stop', () => {
    const times = [0.05, 0.1, 0.2, 0.33];
    expect(times.some((t) => swayOf('rolling', t, true).pitch !== 0)).toBe(true);
    expect(times.every((t) => swayOf('rolling', t, true).lift >= 0)).toBe(true);
    for (const t of times)
      expect(swayOf('rolling', t, false)).toEqual({ pitch: 0, roll: 0, lift: 0 });
  });

  it('rolls a hull wherever it floats', () => {
    expect(swayOf('hull', 1, false).roll).not.toBe(0);
    expect(Math.abs(swayOf('hull', 1, true).roll)).toBeLessThanOrEqual(0.04);
  });

  it('banks a wing into its turn, never past the widest bank, and flies a line level', () => {
    expect(swayOf('wing', 3, true, 0).roll).toBeCloseTo(0);
    expect(swayOf('wing', 3, true, 0.2).roll).toBeLessThan(0);
    expect(swayOf('wing', 3, true, -0.2).roll).toBeGreaterThan(0);
    expect(swayOf('wing', 3, true, 5).roll).toBe(-MAX_BANK);
  });

  it('leaves infantry upright', () => {
    expect(swayOf(null, 2, true, 1)).toEqual({ pitch: 0, roll: 0, lift: 0 });
  });
});

describe('bendAround', () => {
  const p = (x: number, z: number) => ({ x, z });

  it('reads a turn towards +x as a left turn, and a straight road as none', () => {
    expect(bendAround(p(0, -1), p(0, 0), p(1, 1))).toBeCloseTo(Math.PI / 4);
    expect(bendAround(p(0, -1), p(0, 0), p(-1, 1))).toBeCloseTo(-Math.PI / 4);
    expect(bendAround(p(0, -1), p(0, 0), p(0, 1))).toBeCloseTo(0);
  });

  it('flies level at either end of the leg, where one stretch has no length', () => {
    expect(bendAround(p(0, 0), p(0, 0), p(1, 1))).toBe(0);
    expect(bendAround(p(-3, 2), p(0, 0), p(0, 0))).toBe(0);
  });

  it('ignores the seam: a jump wider than a quarter turn is not a turn', () => {
    expect(bendAround(p(0, -1), p(0, 0), p(-0.1, -1))).toBe(0);
  });
});
