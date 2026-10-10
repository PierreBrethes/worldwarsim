import { describe, expect, it } from 'vitest';
import { createGusts, GUST_FIRST_S, GUST_GAP_S, GUST_LENGTH_S } from './gusts';

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('gusts', () => {
  it('is calm before the first gust', () => {
    const gusts = createGusts(sequence(0, 0.5, 0.5));
    expect(gusts.at(0)).toBeNull();
    expect(GUST_FIRST_S[0]).toBe(10);
    expect(gusts.at(GUST_FIRST_S[0] - 0.1)).toBeNull();
  });

  it('rises, peaks and falls back to nothing over its length', () => {
    const gusts = createGusts(sequence(0, 0.25, 0.75));
    const start = GUST_FIRST_S[0];
    const forces = [0.1, 0.5, 0.9].map((p) => gusts.at(start + p * GUST_LENGTH_S)!.force);
    expect(forces[1]).toBeCloseTo(1);
    expect(forces[0]).toBeLessThan(0.3);
    expect(forces[2]).toBeLessThan(0.3);
    expect(gusts.at(start + GUST_LENGTH_S + 0.01)).toBeNull();
  });

  it('keeps direction and band for the whole gust, and redraws them for the next', () => {
    const gusts = createGusts(sequence(0, 0.25, 0.75, 0, 0.5, 0.1));
    const start = GUST_FIRST_S[0];
    const a = gusts.at(start + 1)!;
    const b = gusts.at(start + 3)!;
    expect([b.angle, b.band]).toEqual([a.angle, a.band]);
    expect(a.angle).toBeCloseTo(Math.PI * 0.5);
    expect(a.band).toBeCloseTo(0.75);
    const next = gusts.at(start + GUST_LENGTH_S + GUST_GAP_S[0] + 1)!;
    expect(next).not.toBeNull();
    expect(next.angle).not.toBeCloseTo(a.angle);
  });

  it('spaces gusts by at least the minimum gap', () => {
    const gusts = createGusts(sequence(0));
    const end = GUST_FIRST_S[0] + GUST_LENGTH_S;
    expect(gusts.at(end + GUST_GAP_S[0] - 0.1)).toBeNull();
    expect(gusts.at(end + GUST_GAP_S[0] + 0.1)).not.toBeNull();
  });
});
