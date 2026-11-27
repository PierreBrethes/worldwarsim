import { describe, expect, it } from 'vitest';
import { MINUTES_PER_1000_KM_ON_LAND, MONDIALE_PACE } from '../../convex/constants';
import { onFootMinutes, scaleBarOf } from './map-scale';

describe('scaleBarOf', () => {
  it('takes the longest round length that fits the room', () => {
    expect(scaleBarOf(5, 120)).toEqual({ km: 500, px: 100 });
    expect(scaleBarOf(5, 99)).toEqual({ km: 200, px: 40 });
    expect(scaleBarOf(1, 130)).toEqual({ km: 100, px: 100 });
    expect(scaleBarOf(1, 260)).toEqual({ km: 200, px: 200 });
  });

  it('stays round at every depth of the zoom', () => {
    for (const kmPerPx of [0.02, 0.3, 1.7, 9, 40, 120]) {
      const { km } = scaleBarOf(kmPerPx, 140)!;
      const mantissa = km / 10 ** Math.floor(Math.log10(km));
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1000) / 1000);
    }
  });

  it('is as wide as its length says, never wider than the room', () => {
    const { km, px } = scaleBarOf(3.3, 140)!;
    expect(px).toBeCloseTo(km / 3.3, 6);
    expect(px).toBeLessThanOrEqual(140);
  });

  it('draws nothing when the camera says nothing', () => {
    expect(scaleBarOf(0, 140)).toBeNull();
    expect(scaleBarOf(Number.NaN, 140)).toBeNull();
  });
});

describe('onFootMinutes', () => {
  it('reads the domain pace: the game measures 14 minutes per 1 000 km on foot, slowed by the Mondiale', () => {
    // KM_PER_UNIT rounds the unit at 111 km: allow the routing's own whole-minute rounding.
    expect(onFootMinutes(1000)).toBeCloseTo(MINUTES_PER_1000_KM_ON_LAND * MONDIALE_PACE, 0);
  });

  it('grows with the length', () => {
    expect(onFootMinutes(500)).toBeLessThan(onFootMinutes(1000));
    expect(onFootMinutes(2000)).toBeGreaterThan(onFootMinutes(1000));
  });
});
