import { bearingDegrees, distanceKm, pathLengthKm, type LonLat } from './geo';
import { distanceProgressAt, pointAtDistanceShare, type MarchingForce } from './interception';
import { legCost } from './route-timing';
import { TRANSFER_COST, type RouteLeg } from './routing';

/**
 * **What a sighting is allowed to show of a thread** (design sheet 04, revision of 13/09/2026,
 * decision 4a). A detector served the whole polyline and both declared endpoints, so the first
 * sentry to catch a column learnt its destination — the thing the fog exists to keep. What it
 * serves now is the stretch the window covers and nothing else: no point before it opened, no
 * point after it closed, and therefore no arrival.
 *
 * The future part of the window travels all the same. A window is already a stored prediction —
 * the server computed it at departure — and the client discovers the stretch by walking it, so
 * cutting it at `now` would only mean recomputing the same geometry at every read.
 */
export type SeenSegment = {
  readonly points: ReadonlyArray<LonLat>;
  /**
   * The media of the stretch, in the shape the route reader expects: a window that spans a quay
   * carries two, which is how the thread keeps its dock and how `routeOf` keeps deriving a mode
   * rather than storing one.
   */
  readonly legs: ReadonlyArray<RouteLeg>;
  readonly distanceUnits: number;
  readonly costUnits: number;
  /** The column's direction **at the last point seen**, which is what leaving a radius reveals.
   *  The bearing from one end of the window to the other would flatten a turn taken inside it. */
  readonly headingDegrees: number;
};

/** One sample per minute of march, and never more than this: a six-hour window would otherwise
 *  serve three hundred and sixty points of a thread nobody reads that finely. */
const MAX_SAMPLES = 96;
const MINUTE = 60_000;
/** Two shares closer than this stand at the same place on the thread. */
const SAME_SHARE = 1e-9;
/** How far along the thread a one-instant window looks to find a direction at all. */
const HEADING_STEP_SHARE = 1e-3;

export function seenSegment(force: MarchingForce, from: number, to: number): SeenSegment {
  const opened = Math.min(Math.max(Math.min(from, to), force.departedAt), force.arrivesAt);
  const closed = Math.min(Math.max(Math.max(from, to), opened), force.arrivesAt);
  const start = distanceProgressAt(force, opened);
  const end = Math.max(start, distanceProgressAt(force, closed));

  const steps = Math.min(MAX_SAMPLES, Math.max(1, Math.round((closed - opened) / MINUTE)));
  const shares = [];
  for (let index = 0; index <= steps; index += 1) {
    shares.push(distanceProgressAt(force, opened + ((closed - opened) * index) / steps));
  }
  /** A turn taken inside the window is a vertex of the thread, and a sampling that straddles it
   *  cuts the corner: the served stretch would leave the road it was walked on. */
  for (const share of interiorShares(force.points)) {
    if (share > start && share < end) shares.push(share);
  }

  const points = sorted(shares, start, end).map((share) =>
    pointAtDistanceShare(force.points, share),
  );
  const legs = mediaBetween(force.legs ?? [], start, end);
  return {
    points,
    legs,
    distanceUnits: legs.reduce((sum, leg) => sum + leg.distanceUnits, 0),
    costUnits:
      legs.reduce((sum, leg) => sum + legCost(leg, force.landCost), 0) +
      Math.max(0, legs.length - 1) * TRANSFER_COST,
    headingDegrees: headingAtExit(points) ?? headingAround(force.points, end),
  };
}

/** The heading between the last two points of a stretch — `null` when a window narrow enough to
 *  hold a single instant left only one. */
export function headingAtExit(points: ReadonlyArray<LonLat>): number | null {
  const last = points[points.length - 1];
  const before = points[points.length - 2];
  return last === undefined || before === undefined ? null : bearingDegrees(before, last);
}

/** The direction of the thread where it was last seen, read off a step of the route around that
 *  point. It reaches outside the window, but only for a bearing — which a sighting grants. */
function headingAround(points: ReadonlyArray<LonLat>, share: number): number {
  const back = Math.max(0, share - HEADING_STEP_SHARE);
  const ahead = back === share ? Math.min(1, share + HEADING_STEP_SHARE) : share;
  return bearingDegrees(pointAtDistanceShare(points, back), pointAtDistanceShare(points, ahead));
}

const sorted = (shares: ReadonlyArray<number>, start: number, end: number): Array<number> => {
  const kept: number[] = [];
  for (const share of [...shares].sort((a, b) => a - b)) {
    const clamped = Math.min(end, Math.max(start, share));
    const last = kept[kept.length - 1];
    if (last === undefined || clamped - last > SAME_SHARE) kept.push(clamped);
  }
  return kept;
};

/** The shares of the interior vertices, measured on the thread's own length — the same metric
 *  `pointAtDistanceShare` walks, so a vertex inserted here lands exactly on itself. */
function interiorShares(points: ReadonlyArray<LonLat>): ReadonlyArray<number> {
  const total = pathLengthKm(points);
  if (total === 0) return [];
  let walked = 0;
  const shares: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    walked += distanceKm(points[index - 1]!, points[index]!);
    shares.push(walked / total);
  }
  return shares;
}

/**
 * The legs cut to the window, by the share of distance they hold. A degenerate window keeps the
 * medium it sits on with no length: the domain of a movement is served information (design sheet
 * 04, « le domaine est visible ») and a stretch without legs would take it back by accident.
 */
function mediaBetween(
  legs: ReadonlyArray<RouteLeg>,
  start: number,
  end: number,
): ReadonlyArray<RouteLeg> {
  const total = legs.reduce((sum, leg) => sum + leg.distanceUnits, 0);
  if (total <= 0) return [];

  const cut: RouteLeg[] = [];
  let walked = 0;
  let standing = legs[legs.length - 1]!.medium;
  for (const leg of legs) {
    const from = walked / total;
    walked += leg.distanceUnits;
    const to = walked / total;
    if (from <= start && start < to) standing = leg.medium;
    const overlap = Math.min(to, end) - Math.max(from, start);
    if (overlap > 0) cut.push({ medium: leg.medium, distanceUnits: overlap * total });
  }
  return cut.length > 0 ? cut : [{ medium: standing, distanceUnits: 0 }];
}
