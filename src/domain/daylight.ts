import type { LonLat } from './geo';

/**
 * **Le jour et la nuit suivent le vrai soleil** (décision de Pierre, 13/10/2026, qui remplace le
 * cycle de 5 h) : il fait nuit à Paris quand il fait nuit à Paris. Une fonction pure de l'heure et
 * du lieu, la même pour tous, comme le vent ; rien ne la lit pour une règle.
 */

/** Sun altitudes bounding the twilight: above, full day; below, full night (end of nautical dusk). */
export const DAY_ALTITUDE_DEG = 4;
export const NIGHT_ALTITUDE_DEG = -12;

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

const wrap180 = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * Where the sun stands at the zenith: the low-precision almanac formulas (a hundredth of a degree
 * over the century), declination and equation of time included through the right ascension.
 */
export function subsolarPoint(epochMs: number): LonLat {
  const days = (epochMs - J2000_MS) / DAY_MS;
  const anomaly = (357.529 + 0.98560028 * days) * RAD;
  const meanLongitude = 280.459 + 0.98564736 * days;
  const longitude =
    (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * days) * RAD;
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude)) / RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude)) / RAD;
  const siderealTime = 280.46061837 + 360.98564736629 * days;
  return [wrap180(rightAscension - siderealTime), declination];
}

/** The sun's height above the horizon at `at`, in degrees. */
export function sunAltitude(sun: LonLat, at: LonLat): number {
  const [sunLon, sunLat] = sun;
  const [lon, lat] = at;
  const sine =
    Math.sin(lat * RAD) * Math.sin(sunLat * RAD) +
    Math.cos(lat * RAD) * Math.cos(sunLat * RAD) * Math.cos((lon - sunLon) * RAD);
  return Math.asin(Math.min(1, Math.max(-1, sine))) / RAD;
}

/** 0 in full day, 1 in full night, a smooth twilight between. The board's shader mirrors it. */
export function nightOfAltitude(altitude: number): number {
  const t = Math.min(
    1,
    Math.max(0, (DAY_ALTITUDE_DEG - altitude) / (DAY_ALTITUDE_DEG - NIGHT_ALTITUDE_DEG)),
  );
  return t * t * (3 - 2 * t);
}

export const nightAt = (epochMs: number, at: LonLat): number =>
  nightOfAltitude(sunAltitude(subsolarPoint(epochMs), at));
