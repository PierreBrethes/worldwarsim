export type LonLat = readonly [lon: number, lat: number];

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function shortestLongitudeGap(lonA: number, lonB: number): number {
  const raw = lonB - lonA;
  if (raw > 180) return raw - 360;
  if (raw < -180) return raw + 360;
  return raw;
}

export function distanceKm(a: LonLat, b: LonLat): number {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(shortestLongitudeGap(a[0], b[0]));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a[1])) * Math.cos(toRadians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function crossesAntimeridian(a: LonLat, b: LonLat): boolean {
  return Math.abs(b[0] - a[0]) > 180;
}

/**
 * The heading from one point to another, in degrees clockwise from north. It is what a detected
 * arc shows of an adversary — the fog grants the thread and the bearing, never the type nor the
 * composition (design sheet 04) — and the shorter way round, so a leg across the antimeridian
 * does not report a heading due west for a column walking east.
 */
export function bearingDegrees(from: LonLat, to: LonLat): number {
  const deltaLon = toRadians(shortestLongitudeGap(from[0], to[0]));
  const fromLat = toRadians(from[1]);
  const toLat = toRadians(to[1]);
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
