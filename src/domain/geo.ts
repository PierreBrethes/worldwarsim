export type LonLat = readonly [lon: number, lat: number];

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

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

/** Follow one great-circle bearing for an exact surface distance. Longitude is folded back into
 * the map's canonical interval, so a search disk may cross the antimeridian without splitting. */
export function destinationPoint(origin: LonLat, distance: number, bearing: number): LonLat {
  const angularDistance = Math.max(0, distance) / EARTH_RADIUS_KM;
  const heading = toRadians(bearing);
  const originLat = toRadians(origin[1]);
  const originLon = toRadians(origin[0]);
  const latitude = Math.asin(
    Math.sin(originLat) * Math.cos(angularDistance) +
      Math.cos(originLat) * Math.sin(angularDistance) * Math.cos(heading),
  );
  const longitude =
    originLon +
    Math.atan2(
      Math.sin(heading) * Math.sin(angularDistance) * Math.cos(originLat),
      Math.cos(angularDistance) - Math.sin(originLat) * Math.sin(latitude),
    );
  return [((toDegrees(longitude) + 540) % 360) - 180, toDegrees(latitude)];
}

/** The length of a polyline, in kilometres. One summation for the whole codebase: a thread's
 *  length is read by the sighting segment, by the pawn and by the heading estimate, and three
 *  loops over the same points are three chances to disagree on where half way is. */
export const pathLengthKm = (points: ReadonlyArray<LonLat>): number =>
  points.slice(1).reduce((sum, point, index) => sum + distanceKm(points[index]!, point), 0);

/**
 * **Where a heading would take a column**, sampled every `stepKm` up to `km` and ending exactly
 * on the far end. It answers the one question a truncated sighting can still ask — *does this
 * thing come my way* — without a destination to read: the heading is prolonged, and the answer
 * is an estimate the label already calls one.
 *
 * Zero distance is no point at all rather than the origin: a column with nothing left to walk
 * has no continuation, and returning where it stands would make the caller test a position it
 * already holds.
 */
export function pointsAhead(
  from: LonLat,
  headingDegrees: number,
  km: number,
  stepKm: number,
): ReadonlyArray<LonLat> {
  if (!(km > 0) || !(stepKm > 0)) return [];
  const points: LonLat[] = [];
  for (let walked = stepKm; walked < km; walked += stepKm) {
    points.push(destinationPoint(from, walked, headingDegrees));
  }
  points.push(destinationPoint(from, km, headingDegrees));
  return points;
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
