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
