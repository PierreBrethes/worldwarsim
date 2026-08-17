import { distanceKm, shortestLongitudeGap, type LonLat } from './geo';

/**
 * **Where two forces meet on the way** (ADR 0008, design sheet 08 §2). Every force carries an
 * interception radius; a movement that crosses one is brought to contact at the point where it
 * entered, and the interceptor takes the initiative.
 *
 * The contact is worked out **once, when the movement is created** — the route, the departure
 * and the arrival are all known then, and so is every force already on the board. Recomputing it
 * later would mean re-deriving the same geometry on every reading, and worse, re-deriving it
 * *differently* the day the route is smoothed.
 *
 * A movement created afterwards checks itself against what already stands: it is the newcomer
 * that looks, never the ones already there. So two columns crossing are caught by whichever
 * departed second, and no force has to be re-examined when a third one appears.
 */

export type MarchingForce = {
  readonly id: string;
  readonly points: ReadonlyArray<LonLat>;
  readonly departedAt: number;
  readonly arrivesAt: number;
};

export type StandingForce = {
  readonly id: string;
  readonly point: LonLat;
};

export type Contact = {
  readonly at: number;
  readonly point: LonLat;
  readonly withId: string;
};

/**
 * How finely the two paths are walked. A closed form on two piecewise great-circle paths is a
 * quartic per pair of segments; the sampling is bounded, deterministic, and wrong by at most one
 * step of travel — against a radius nobody has measured, that precision is theatre.
 */
export const INTERCEPTION_SAMPLES = 240;

/** Where a marching force stands at an instant, clamped to its departure and its arrival. */
export function positionAt(force: MarchingForce, at: number): LonLat {
  const points = force.points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) throw new Error('a force without a route');
  if (points.length === 1 || at <= force.departedAt) return first;
  if (at >= force.arrivesAt) return last;

  const legs = points.slice(1).map((point, index) => distanceKm(points[index]!, point));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  if (total === 0) return first;

  const progress = (at - force.departedAt) / (force.arrivesAt - force.departedAt);
  let walked = progress * total;
  for (const [index, leg] of legs.entries()) {
    if (walked > leg && index < legs.length - 1) {
      walked -= leg;
      continue;
    }
    return between(points[index]!, points[index + 1]!, leg === 0 ? 0 : walked / leg);
  }
  return last;
}

/**
 * The first contact a movement runs into — the earliest, whoever causes it. Only one is
 * returned: an engagement changes the column that comes out of it, so anything the same march
 * would have met later has to be computed against what is left of it, not against what left.
 */
export function firstInterception({
  mine,
  standing,
  marching,
  radiusKm,
  samples = INTERCEPTION_SAMPLES,
}: {
  mine: MarchingForce;
  standing: ReadonlyArray<StandingForce>;
  marching: ReadonlyArray<MarchingForce>;
  radiusKm: number;
  samples?: number;
}): Contact | null {
  const span = mine.arrivesAt - mine.departedAt;
  if (span <= 0) return null;
  const step = span / samples;

  for (let index = 0; index <= samples; index += 1) {
    const at = mine.departedAt + index * step;
    const here = positionAt(mine, at);

    const caught: Array<{ id: string }> = [];
    for (const force of standing) {
      if (distanceKm(here, force.point) <= radiusKm) caught.push({ id: force.id });
    }
    for (const force of marching) {
      if (at < force.departedAt || at > force.arrivesAt) continue;
      if (distanceKm(here, positionAt(force, at)) <= radiusKm) caught.push({ id: force.id });
    }
    if (caught.length === 0) continue;

    // Two forces catching the same step is a tie the identifier breaks, so that the same board
    // always resolves the same engagement first.
    const withId = caught.map((force) => force.id).sort()[0]!;
    return { at, point: here, withId };
  }
  return null;
}

/** Interpolated along the shorter way round, so a leg across the antimeridian does not go the
 *  long way home. */
function between(from: LonLat, to: LonLat, ratio: number): LonLat {
  const lon = from[0] + shortestLongitudeGap(from[0], to[0]) * ratio;
  return [((lon + 540) % 360) - 180, from[1] + (to[1] - from[1]) * ratio];
}
