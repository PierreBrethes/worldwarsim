import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import {
  boardInstant,
  DEFAULT_DAY_CYCLE,
  LAMP_FLOOR_DEG,
  lampDirection,
  MOON_AZIMUTH_DEG,
  MOON_ELEVATION_DEG,
  nightAt,
  subsolarPoint,
  sunAltitude,
  sunLightAt,
} from './daylight';

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

describe('sunLightAt', () => {
  const degrees = (radians: number) => (radians * 180) / Math.PI;

  it('comes from the south at noon in Paris, the east in the morning, the west at dusk', () => {
    expect(degrees(sunLightAt(Date.UTC(2026, 9, 21, 11, 45), PARIS).azimuth)).toBeCloseTo(180, -1);
    expect(degrees(sunLightAt(Date.UTC(2026, 9, 21, 8), PARIS).azimuth)).toBeLessThan(150);
    expect(degrees(sunLightAt(Date.UTC(2026, 9, 21, 16), PARIS).azimuth)).toBeGreaterThan(220);
  });

  it('keeps the true altitude, and lights from no lower than the floor', () => {
    const noon = sunLightAt(Date.UTC(2026, 9, 21, 11, 45), PARIS);
    expect(noon.altitude).toBeCloseTo(
      sunAltitude(subsolarPoint(Date.UTC(2026, 9, 21, 11, 45)), PARIS),
    );
    expect(noon.elevation).toBe(noon.altitude);
    const dusk = sunLightAt(Date.UTC(2026, 9, 21, 16, 30), PARIS);
    expect(dusk.altitude).toBeLessThan(LAMP_FLOOR_DEG);
    expect(dusk.elevation).toBe(LAMP_FLOOR_DEG);
  });
});

describe('lampDirection', () => {
  const degrees = (radians: number) => (radians * 180) / Math.PI;
  const noon = sunLightAt(Date.UTC(2026, 9, 21, 11, 45), PARIS);

  it('is the sun by day and the fixed moon by night', () => {
    expect(lampDirection(noon, 0).azimuth).toBeCloseTo(noon.azimuth);
    expect(lampDirection(noon, 0).elevation).toBeCloseTo(noon.elevation);
    const moon = lampDirection(noon, 1);
    expect(degrees(moon.azimuth)).toBeCloseTo(MOON_AZIMUTH_DEG);
    expect(moon.elevation).toBeCloseTo(MOON_ELEVATION_DEG);
  });

  /** The regression of #195's review: the sun's azimuth at the antipode, turning with the clock. */
  it('does not move with the sun once the night is full', () => {
    const at = (hour: number) => {
      const instant = Date.UTC(2026, 9, 21) + hour * HOUR_MS;
      return lampDirection(sunLightAt(instant, PARIS), nightAt(instant, PARIS));
    };
    const midnight = at(0);
    for (const hour of [21, 22, 23, 0.5, 1, 2, 3]) {
      expect(at(hour).azimuth).toBeCloseTo(midnight.azimuth, 6);
      expect(at(hour).elevation).toBeCloseTo(midnight.elevation, 6);
    }
  });

  it('turns smoothly through the twilight, whatever side the sun is on', () => {
    for (const sunAzimuth of [0, 1, 2, 3, 4, 5, 6]) {
      const sun = { azimuth: sunAzimuth, altitude: 0, elevation: LAMP_FLOOR_DEG };
      let previous = lampDirection(sun, 0);
      for (let night = 0.05; night <= 1.0001; night += 0.05) {
        const lamp = lampDirection(sun, night);
        const step = Math.abs(
          ((lamp.azimuth - previous.azimuth + 3 * Math.PI) % (2 * Math.PI)) - Math.PI,
        );
        expect(step).toBeLessThan(0.9);
        expect(Math.abs(lamp.elevation - previous.elevation)).toBeLessThan(20);
        previous = lamp;
      }
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

  it('runs a day per two real hours by default', () => {
    const start = Date.UTC(2026, 9, 13, 12);
    expect(boardInstant(start, 'twoHours')).toBe(Date.UTC(2026, 9, 13));
    expect(boardInstant(start + HOUR_MS, 'twoHours')).toBe(Date.UTC(2026, 9, 13, 12));
    expect(boardInstant(start + 30 * 60_000, 'twoHours')).toBe(Date.UTC(2026, 9, 13, 6));
    expect(DEFAULT_DAY_CYCLE).toBe('twoHours');
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
