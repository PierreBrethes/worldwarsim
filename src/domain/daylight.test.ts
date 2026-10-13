import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import { boardInstant, nightAt, subsolarPoint, sunAltitude } from './daylight';

const PARIS: LonLat = [2.35, 48.86];
const HOUR_MS = 3_600_000;

describe('subsolarPoint', () => {
  it('stands near 0°/0° at noon UTC on the March equinox', () => {
    const [lon, lat] = subsolarPoint(Date.UTC(2026, 2, 20, 12));
    expect(Math.abs(lat)).toBeLessThan(0.5);
    expect(Math.abs(lon)).toBeLessThan(3);
  });

  it('reaches the tropics at the solstices', () => {
    expect(subsolarPoint(Date.UTC(2026, 5, 21, 12))[1]).toBeCloseTo(23.44, 1);
    expect(subsolarPoint(Date.UTC(2026, 11, 21, 12))[1]).toBeCloseTo(-23.44, 1);
  });

  it('runs west, fifteen degrees an hour', () => {
    const noon = subsolarPoint(Date.UTC(2026, 9, 13, 12))[0];
    const one = subsolarPoint(Date.UTC(2026, 9, 13, 13))[0];
    expect(noon - one).toBeCloseTo(15, 0);
  });
});

describe('sunAltitude', () => {
  it('is 90° under the sun and -90° at its antipode', () => {
    expect(sunAltitude([30, 10], [30, 10])).toBeCloseTo(90);
    expect(sunAltitude([30, 10], [-150, -10])).toBeCloseTo(-90);
  });
});

describe('nightAt', () => {
  it('is night in Paris at 11 pm UTC in winter, day at noon', () => {
    expect(nightAt(Date.UTC(2026, 0, 15, 23), PARIS)).toBe(1);
    expect(nightAt(Date.UTC(2026, 0, 15, 12), PARIS)).toBe(0);
  });

  it('keeps the summer night short in Paris: still light at 8 pm UTC in June', () => {
    expect(nightAt(Date.UTC(2026, 5, 21, 19), PARIS)).toBeLessThan(0.5);
  });

  it('crosses dusk and dawn without a jump', () => {
    const start = Date.UTC(2026, 9, 13);
    let previous = nightAt(start, PARIS);
    for (let t = start; t <= start + 24 * HOUR_MS; t += 60_000) {
      const night = nightAt(t, PARIS);
      expect(Math.abs(night - previous)).toBeLessThan(0.02);
      previous = night;
    }
  });
});

describe('boardInstant', () => {
  const noon = Date.UTC(2026, 9, 13, 12, 20);

  it('is the real instant in the real cycle', () => {
    expect(boardInstant(noon, 'real')).toBe(noon);
  });

  it('runs a day per real hour, on the real date', () => {
    const start = Date.UTC(2026, 9, 13, 12);
    expect(boardInstant(start, 'hour')).toBe(Date.UTC(2026, 9, 13));
    expect(boardInstant(start + 30 * 60_000, 'hour')).toBe(Date.UTC(2026, 9, 13, 12));
    expect(boardInstant(start + 15 * 60_000, 'hour')).toBe(Date.UTC(2026, 9, 13, 6));
  });

  it('moves the terminator all the way round in an hour, without a jump', () => {
    const start = Date.UTC(2026, 9, 13, 23);
    let previous = subsolarPoint(boardInstant(start, 'hour'))[0];
    for (let t = start + 10_000; t < start + 2 * HOUR_MS; t += 10_000) {
      const lon = subsolarPoint(boardInstant(t, 'hour'))[0];
      const step = Math.abs(((lon - previous + 540) % 360) - 180);
      expect(step).toBeLessThan(1.5);
      previous = lon;
    }
  });

  it('keeps the real date across simulated midnight', () => {
    const justBefore = Date.UTC(2026, 9, 13, 23, 59, 59);
    expect(boardInstant(justBefore, 'hour')).toBeLessThan(Date.UTC(2026, 9, 14));
    expect(boardInstant(justBefore, 'hour')).toBeGreaterThanOrEqual(Date.UTC(2026, 9, 13));
  });
});
