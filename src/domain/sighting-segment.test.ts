import { describe, expect, it } from 'vitest';
import { bearingDegrees, distanceKm, pointsAhead, type LonLat } from './geo';
import { positionAt, type MarchingForce } from './interception';
import { headingAtExit, seenSegment } from './sighting-segment';
import { COST_BY_MEDIUM, KM_PER_UNIT, TRANSFER_COST } from './routing';

const HOUR = 3_600_000;

/** A straight run east along the equator, a degree of longitude per point. */
const straight = (degrees: number): MarchingForce => ({
  id: 'straight',
  points: Array.from({ length: degrees + 1 }, (_, step) => [step, 0]) as ReadonlyArray<LonLat>,
  legs: [{ medium: 'land', distanceUnits: degrees }],
  distanceUnits: degrees,
  departedAt: 0,
  arrivesAt: 10 * HOUR,
});

/** East along the equator, then a right-angle turn north at the tenth degree. */
const cornered: MarchingForce = {
  id: 'cornered',
  points: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
  legs: [{ medium: 'land', distanceUnits: 20 }],
  distanceUnits: 20,
  departedAt: 0,
  arrivesAt: 10 * HOUR,
};

/** Five degrees on foot, then five at sea — one quay in the middle of the thread. */
const crossing: MarchingForce = {
  id: 'crossing',
  points: [
    [0, 0],
    [5, 0],
    [10, 0],
  ],
  legs: [
    { medium: 'land', distanceUnits: 5 },
    { medium: 'sea', distanceUnits: 5 },
  ],
  distanceUnits: 10,
  departedAt: 0,
  arrivesAt: 10 * HOUR,
};

describe('the stretch a sighting serves', () => {
  it('starts and ends where the column stood when the window opened and closed', () => {
    const force = straight(10);
    const segment = seenSegment(force, 2 * HOUR, 5 * HOUR);
    expect(segment.points[0]![0]).toBeCloseTo(positionAt(force, 2 * HOUR)[0], 6);
    expect(segment.points[segment.points.length - 1]![0]).toBeCloseTo(
      positionAt(force, 5 * HOUR)[0],
      6,
    );
  });

  /** The whole of decision 4a, in one assertion: the destination is not in what is served. */
  it('serves nothing before the window and nothing after it', () => {
    const segment = seenSegment(straight(10), 2 * HOUR, 5 * HOUR);
    for (const [lon] of segment.points) {
      expect(lon).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(lon).toBeLessThanOrEqual(5 + 1e-6);
    }
  });

  it('holds no interior vertex when the window sits inside one straight leg', () => {
    const segment = seenSegment(straight(10), 2.5 * HOUR, 3.5 * HOUR);
    const drift = segment.points.map(([, lat]) => lat);
    expect(Math.max(...drift)).toBeCloseTo(0, 9);
    expect(segment.points.length).toBeGreaterThan(1);
  });

  /** A sampling that straddled a turn cut the corner, and the served stretch left the road the
   *  column was actually walked down. */
  it('keeps the vertex of a turn taken inside the window', () => {
    const segment = seenSegment(cornered, 4 * HOUR, 6 * HOUR);
    const corner = segment.points.find((point) => distanceKm(point, [10, 0]) < 1) as
      LonLat | undefined;
    expect(corner).toBeDefined();
    expect(segment.points.some(([, lat]) => lat > 0.5)).toBe(true);
  });

  it('serves two media when the window spans a quay, with the transfer in its cost', () => {
    const segment = seenSegment(crossing, 2 * HOUR, 8 * HOUR);
    expect(segment.legs.map((leg) => leg.medium)).toEqual(['land', 'sea']);
    expect(segment.costUnits).toBeCloseTo(
      segment.legs[0]!.distanceUnits * COST_BY_MEDIUM.land +
        segment.legs[1]!.distanceUnits * COST_BY_MEDIUM.sea +
        TRANSFER_COST,
      6,
    );
    expect(segment.distanceUnits).toBeLessThan(crossing.distanceUnits!);
  });

  it('serves one medium and no transfer when the window stays on one side of the quay', () => {
    const segment = seenSegment(crossing, 0, HOUR);
    expect(segment.legs.map((leg) => leg.medium)).toEqual(['land']);
    expect(segment.costUnits).toBeCloseTo(segment.legs[0]!.distanceUnits * COST_BY_MEDIUM.land, 6);
  });

  /** A window that opened and closed on one sample: one point, and a heading read off the thread
   *  around it — a bearing is granted, a second position is not. */
  it('narrows to a single point, and still says which way the column was pointing', () => {
    const segment = seenSegment(straight(10), 4 * HOUR, 4 * HOUR);
    expect(segment.points).toHaveLength(1);
    expect(segment.headingDegrees).toBeCloseTo(90, 1);
    expect(segment.legs.map((leg) => leg.medium)).toEqual(['land']);
    expect(segment.distanceUnits).toBe(0);
  });

  it('reads the same single point at the very instant of departure', () => {
    const segment = seenSegment(straight(10), 0, 0);
    expect(segment.points).toEqual([[0, 0]]);
    expect(segment.headingDegrees).toBeCloseTo(90, 1);
  });

  it('clamps a window that outlasts the trip to the arrival', () => {
    const segment = seenSegment(straight(10), 9 * HOUR, 99 * HOUR);
    expect(segment.points[segment.points.length - 1]![0]).toBeCloseTo(10, 6);
  });

  /**
   * Bounded on purpose. A window is sampled about once per minute of march, capped, plus the
   * vertices of the thread it crosses — so the served stretch never carries more than the whole
   * polyline the old arc already served, and a six-hour watch does not become a thousand points.
   */
  it('samples once a minute up to a cap, plus the vertices it actually crosses', () => {
    const force = straight(10);
    expect(seenSegment(force, 0, 10 * 60_000).points.length).toBeLessThanOrEqual(12);
    expect(seenSegment(force, 0, 10 * HOUR).points.length).toBeLessThanOrEqual(
      97 + force.points.length,
    );
  });
});

describe('the heading a window reveals', () => {
  it('is the direction between the last two points, not across the whole stretch', () => {
    const segment = seenSegment(cornered, 4 * HOUR, 6 * HOUR);
    const points = segment.points;
    expect(segment.headingDegrees).toBeCloseTo(
      bearingDegrees(points[points.length - 2]!, points[points.length - 1]!),
      6,
    );
    /** Due north on the far leg of the corner, where the straight bearing over the window would
     *  have reported something north-east. */
    expect(segment.headingDegrees).toBeCloseTo(0, 0);
    expect(bearingDegrees(points[0]!, points[points.length - 1]!)).toBeGreaterThan(10);
  });

  it('is nothing at all when there are not two points to read it from', () => {
    expect(headingAtExit([[0, 0]])).toBeNull();
    expect(headingAtExit([])).toBeNull();
  });
});

describe('where a heading would take a column', () => {
  it('is no point at all over no distance', () => {
    expect(pointsAhead([0, 0], 90, 0, 10)).toEqual([]);
  });

  it('walks the heading by the step and lands exactly on the far end', () => {
    const step = 0.25 * KM_PER_UNIT;
    const ahead = pointsAhead([0, 0], 90, 3 * step, step);
    expect(ahead).toHaveLength(3);
    expect(distanceKm([0, 0], ahead[2]!)).toBeCloseTo(3 * step, 3);
    for (const point of ahead) expect(point[1]).toBeCloseTo(0, 6);
  });
});
