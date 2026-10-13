import { describe, expect, it } from 'vitest';
import { DAY_NIGHT_PERIOD_MS, nightAt } from './daylight';

const DAY_MS = 24 * 3_600_000;
const MIDNIGHT = Date.UTC(2026, 9, 13);

describe('nightAt', () => {
  it('drifts from one day to the next: the period does not divide 24 h', () => {
    expect(DAY_MS % DAY_NIGHT_PERIOD_MS).not.toBe(0);
    const eightPm = MIDNIGHT + 20 * 3_600_000;
    const evenings = Array.from({ length: 5 }, (_, day) => nightAt(eightPm + day * DAY_MS));
    expect(new Set(evenings.map((night) => Math.round(night))).size).toBe(2);
  });

  it('is full day in the middle of the light half and full night in the middle of the dark one', () => {
    expect(nightAt(DAY_NIGHT_PERIOD_MS / 4)).toBe(0);
    expect(nightAt((3 * DAY_NIGHT_PERIOD_MS) / 4)).toBe(1);
    expect(nightAt(DAY_NIGHT_PERIOD_MS + DAY_NIGHT_PERIOD_MS / 4)).toBe(0);
  });

  it('crosses dusk and dawn without a jump', () => {
    let previous = nightAt(0);
    for (let t = 0; t <= DAY_NIGHT_PERIOD_MS; t += 10_000) {
      const night = nightAt(t);
      expect(Math.abs(night - previous)).toBeLessThan(0.01);
      previous = night;
    }
    expect(nightAt(DAY_NIGHT_PERIOD_MS / 2)).toBeCloseTo(0.5);
  });
});
