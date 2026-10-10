import { describe, expect, it } from 'vitest';
import { pressureSystemsAt, SYSTEM_LIFE_MS, windAt } from './weather';

const NOON = Date.UTC(2026, 9, 10, 12);

const farFromSystems = (lat: number, epochMs: number): number => {
  const systems = pressureSystemsAt(epochMs);
  for (let lon = -180; lon < 180; lon += 5) {
    const clear = systems.every((s) => {
      const dLon = ((((lon - s.lon) % 360) + 540) % 360) - 180;
      const dx = dLon * Math.cos((s.lat * Math.PI) / 180);
      return Math.hypot(dx, lat - s.lat) > 3 * s.radius;
    });
    if (clear) return lon;
  }
  throw new Error('no clear longitude');
};

describe('windAt', () => {
  it('blows the same for everyone at the same instant', () => {
    expect(windAt(2.35, 48.85, NOON)).toEqual(windAt(2.35, 48.85, NOON));
  });

  it('blows from the east at the equator and from the west at 45°, away from any system', () => {
    for (let hour = 0; hour < 24; hour += 3) {
      const at = NOON + hour * 3_600_000;
      expect(windAt(farFromSystems(0, at), 0, at).u).toBeLessThan(-0.5);
      expect(windAt(farFromSystems(45, at), 45, at).u).toBeGreaterThan(0.4);
      expect(windAt(farFromSystems(-45, at), -45, at).u).toBeGreaterThan(0.4);
    }
  });

  it('keeps about six systems alive, mid-latitude lows and a few tropical ones', () => {
    const systems = pressureSystemsAt(NOON);
    expect(systems.length).toBe(6);
    for (const s of systems) {
      const lat = Math.abs(s.lat);
      if (s.tropical) expect(lat).toBeGreaterThanOrEqual(10);
      else expect(lat).toBeGreaterThanOrEqual(33);
      expect(lat).toBeLessThanOrEqual(s.tropical ? 26 : 62);
    }
  });

  it('turns a low anticlockwise in the north and clockwise in the south, seen from above', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 400 && seen.size < 2; k++) {
      const at = NOON + k * 600_000;
      for (const s of pressureSystemsAt(at)) {
        if (s.kind !== 'low' || s.strength < 0.6) continue;
        const dLon = (0.7 * s.radius) / Math.cos((s.lat * Math.PI) / 180);
        const east = windAt(s.lon + dLon, s.lat, at).v;
        const west = windAt(s.lon - dLon, s.lat, at).v;
        const anticlockwise = east - west > 0;
        expect(anticlockwise).toBe(s.lat > 0);
        seen.add(s.lat > 0 ? 'north' : 'south');
      }
    }
    expect(seen).toEqual(new Set(['north', 'south']));
  });

  it('never jumps, not even when a system is born or dies', () => {
    let worst = 0;
    for (let k = 0; k < 600; k++) {
      const at = NOON + k * (SYSTEM_LIFE_MS / 97);
      for (let lat = -70; lat <= 70; lat += 7) {
        for (let lon = -180; lon < 180; lon += 9) {
          const a = windAt(lon, lat, at);
          const b = windAt(lon, lat, at + 1000);
          worst = Math.max(worst, Math.hypot(a.u - b.u, a.v - b.v));
        }
      }
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('wraps east-west', () => {
    const a = windAt(179.999, 40, NOON);
    const b = windAt(-179.999, 40, NOON);
    expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeLessThan(0.01);
  });
});
