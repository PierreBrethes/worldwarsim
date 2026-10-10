import { describe, expect, it } from 'vitest';
import { currentAt } from './currents';

const NOON = Date.UTC(2026, 9, 10, 12);
const HOURS = Array.from({ length: 12 }, (_, k) => NOON + k * 3_600_000);

describe('currentAt', () => {
  it('flows the same for everyone at the same instant', () => {
    expect(currentAt(-30, 30, NOON)).toEqual(currentAt(-30, 30, NOON));
  });

  it('carries the Gulf Stream north-east off Cape Hatteras', () => {
    for (const at of HOURS) {
      const { u, v } = currentAt(-72, 35, at);
      expect(u).toBeGreaterThan(0);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('runs the Pacific equatorial current westward', () => {
    for (const at of HOURS) expect(currentAt(-140, 1, at).u).toBeLessThan(-0.2);
  });

  it('runs the Antarctic circumpolar current eastward at 55° S', () => {
    for (const at of HOURS) {
      for (let lon = -180; lon < 180; lon += 30) expect(currentAt(lon, -55, at).u).toBeGreaterThan(0.2);
    }
  });

  it('turns the North Atlantic clockwise and the South Atlantic anticlockwise', () => {
    expect(currentAt(-40, 20, NOON).u).toBeLessThan(0);
    expect(currentAt(-40, -38, NOON).u).toBeGreaterThan(0);
    expect(currentAt(-47, -25, NOON).v).toBeLessThan(0);
  });

  it('meanders slowly, never jumping', () => {
    let worst = 0;
    for (let k = 0; k < 200; k++) {
      const at = NOON + k * 97_000;
      for (let lat = -70; lat <= 70; lat += 7) {
        for (let lon = -180; lon < 180; lon += 9) {
          const a = currentAt(lon, lat, at);
          const b = currentAt(lon, lat, at + 1000);
          worst = Math.max(worst, Math.hypot(a.u - b.u, a.v - b.v));
        }
      }
    }
    expect(worst).toBeLessThan(0.01);
    const a = currentAt(-72, 35, NOON);
    const b = currentAt(-72, 35, NOON + 2 * 3_600_000);
    expect(a).not.toEqual(b);
  });

  it('wraps east-west', () => {
    for (const lat of [-55, -30, 1, 30]) {
      const a = currentAt(179.999, lat, NOON);
      const b = currentAt(-179.999, lat, NOON);
      expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeLessThan(0.01);
    }
  });
});
