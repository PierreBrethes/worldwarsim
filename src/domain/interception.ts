import { distanceKm, shortestLongitudeGap, type LonLat } from './geo';
import { COST_BY_MEDIUM, TRANSFER_COST, type Medium, type RouteLeg } from './routing';

/** Timed positions, passive visibility and order-derived encounters along movement routes. */

export type MarchingForce = {
  readonly id: string;
  readonly points: ReadonlyArray<LonLat>;
  readonly legs?: ReadonlyArray<RouteLeg>;
  readonly distanceUnits?: number;
  readonly landCost?: number;
  readonly createdAt?: number;
  readonly departedAt: number;
  readonly arrivesAt: number;
};

export type MobileEncounter = {
  readonly at: number;
  readonly point: LonLat;
  readonly withId: string;
  readonly initiatorId: string;
  readonly medium: Medium;
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

  const progress = distanceProgressAt(force, at);
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
 * The temporal share converted back to a share of geometry. A combined route spends different
 * amounts of time on land and sea and waits at transfers; walking its total length uniformly
 * made a detector see the column in the wrong medium and at the wrong hour.
 */
export function distanceProgressAt(force: MarchingForce, at: number): number {
  const span = force.arrivesAt - force.departedAt;
  if (span <= 0) return 1;
  const temporal = Math.min(1, Math.max(0, (at - force.departedAt) / span));
  const legs = force.legs;
  const distanceUnits = force.distanceUnits;
  if (
    legs === undefined ||
    legs.length === 0 ||
    distanceUnits === undefined ||
    distanceUnits <= 0
  ) {
    return temporal;
  }

  const costs = legs.map((leg) => legCost(leg, force.landCost));
  const total =
    costs.reduce((sum, cost) => sum + cost, 0) + Math.max(0, legs.length - 1) * TRANSFER_COST;
  if (total <= 0) return temporal;

  let left = temporal * total;
  let distance = 0;
  for (const [index, leg] of legs.entries()) {
    if (index > 0) {
      if (left <= TRANSFER_COST) return distance / distanceUnits;
      left -= TRANSFER_COST;
    }
    const cost = costs[index]!;
    if (left <= cost || index === legs.length - 1) {
      const local = cost <= 0 ? 1 : Math.min(1, Math.max(0, left / cost));
      return Math.min(1, Math.max(0, (distance + leg.distanceUnits * local) / distanceUnits));
    }
    left -= cost;
    distance += leg.distanceUnits;
  }
  return 1;
}

/** No encounter is initiated while a column is changing medium at a transfer. */
export function mediumAt(force: MarchingForce, at: number): Medium | null {
  const span = force.arrivesAt - force.departedAt;
  const legs = force.legs;
  if (span <= 0 || legs === undefined || legs.length === 0) return null;
  const temporal = Math.min(1, Math.max(0, (at - force.departedAt) / span));
  const costs = legs.map((leg) => legCost(leg, force.landCost));
  const total =
    costs.reduce((sum, cost) => sum + cost, 0) + Math.max(0, legs.length - 1) * TRANSFER_COST;
  let left = temporal * total;
  for (const [index, leg] of legs.entries()) {
    if (index > 0) {
      if (left <= TRANSFER_COST) return null;
      left -= TRANSFER_COST;
    }
    const cost = costs[index]!;
    if (left <= cost || index === legs.length - 1) return leg.medium;
    left -= cost;
  }
  return legs.at(-1)?.medium ?? null;
}

const legCost = (leg: RouteLeg, landCost = COST_BY_MEDIUM.land): number =>
  leg.medium === 'air'
    ? leg.distanceUnits
    : leg.distanceUnits * (leg.medium === 'sea' ? COST_BY_MEDIUM.sea : landCost);

/**
 * The first mobile contact that may become a pass. Seeing is asymmetric; initiating is narrower:
 * the force must carry an order that engages and both columns must occupy the same medium.
 */
export function firstMobileEncounter({
  a,
  b,
  rangeA,
  rangeB,
  engagesA,
  engagesB,
  after = Math.max(a.departedAt, b.departedAt),
  samples = INTERCEPTION_SAMPLES,
}: {
  a: MarchingForce;
  b: MarchingForce;
  rangeA: number;
  rangeB: number;
  engagesA: boolean;
  engagesB: boolean;
  after?: number;
  samples?: number;
}): MobileEncounter | null {
  const from = Math.max(after, a.departedAt, b.departedAt);
  const to = Math.min(a.arrivesAt, b.arrivesAt);
  if (to < from || (!engagesA && !engagesB)) return null;

  for (let index = 0; index <= samples; index += 1) {
    const at = from + ((to - from) * index) / samples;
    const mediumA = mediumAt(a, at);
    const mediumB = mediumAt(b, at);
    if (mediumA === null || mediumA !== mediumB) continue;
    const pointA = positionAt(a, at);
    const pointB = positionAt(b, at);
    const km = distanceKm(pointA, pointB);
    const aCan = engagesA && km <= rangeA;
    const bCan = engagesB && km <= rangeB;
    if (!aCan && !bCan) continue;

    const initiator = chooseInitiator(a, b, rangeA, rangeB, aCan, bCan);
    return {
      at,
      point: initiator.id === a.id ? pointA : pointB,
      withId: initiator.id === a.id ? b.id : a.id,
      initiatorId: initiator.id,
      medium: mediumA,
    };
  }
  return null;
}

const chooseInitiator = (
  a: MarchingForce,
  b: MarchingForce,
  rangeA: number,
  rangeB: number,
  aCan: boolean,
  bCan: boolean,
): MarchingForce => {
  if (!bCan) return a;
  if (!aCan) return b;
  if (rangeA !== rangeB) return rangeA > rangeB ? a : b;
  if (a.departedAt !== b.departedAt) return a.departedAt < b.departedAt ? a : b;
  if (a.createdAt !== undefined && b.createdAt !== undefined && a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? a : b;
  }
  return a;
};

/** The window in which one mobile detector sees another force in a compatible medium. */
export function mobileSighting({
  observer,
  target,
  radiusKm,
  after = Math.max(observer.departedAt, target.departedAt),
  samples = INTERCEPTION_SAMPLES,
}: {
  observer: MarchingForce;
  target: MarchingForce;
  radiusKm: number;
  after?: number;
  samples?: number;
}): { readonly from: number; readonly to: number } | null {
  const from = Math.max(after, observer.departedAt, target.departedAt);
  const to = Math.min(observer.arrivesAt, target.arrivesAt);
  if (to < from || radiusKm <= 0) return null;
  let opened: number | null = null;
  let closed: number | null = null;
  for (let index = 0; index <= samples; index += 1) {
    const at = from + ((to - from) * index) / samples;
    const observerMedium = mediumAt(observer, at);
    if (observerMedium === null || observerMedium !== mediumAt(target, at)) continue;
    if (distanceKm(positionAt(observer, at), positionAt(target, at)) > radiusKm) continue;
    opened ??= at;
    closed = at;
  }
  return opened === null || closed === null ? null : { from: opened, to: closed };
}

/** Interpolated along the shorter way round, so a leg across the antimeridian does not go the
 *  long way home. */
function between(from: LonLat, to: LonLat, ratio: number): LonLat {
  const lon = from[0] + shortestLongitudeGap(from[0], to[0]) * ratio;
  return [((lon + 540) % 360) - 180, from[1] + (to[1] - from[1]) * ratio];
}

/** One observer, one movement, and the stretch of time it was inside his radius. */
export type Sighting = {
  readonly id: string;
  readonly from: number;
  readonly to: number;
};

/**
 * A detector and how far it hears. **The radius travels with the watcher and not beside the
 * list**: the four detectors of design sheet 04 do not share one — a rifleman standing still
 * hears sixty kilometres, a listening station a hundred and twenty, a listening outpost its
 * whole reach — and a single radius for the call would have meant one walk of the road per
 * kind, which is three chances for three geometries to disagree.
 */
export type Watcher = {
  readonly id: string;
  readonly point: LonLat;
  readonly radiusKm: number;
};

/**
 * **What a standing watcher sees pass** (ADR 0019 §5, design sheet 04). The same walk down the
 * same sampled path as the contact above, against the same segment/circle test — a second
 * geometry for the same question is a second answer waiting to disagree with the first.
 *
 * It answers **windows** rather than a first contact, because a sighting is not an event: the
 * fan-out note asks for `(observer, movement, tStart, tEnd)` rows precisely so that each player
 * reads a table of his own and no reading depends on the movements table
 * (`WWS/docs/technique/brouillard-et-fanout.md`).
 *
 * **One window per watcher**, from the first instant inside the radius to the last. A route that
 * leaves the circle and comes back is served as one thread rather than two rows: the gap teaches
 * an observer nothing he does not already hold — he has the whole thread — and two rows for one
 * pair would be two states to reconcile on screen.
 */
export function sightingsAlong({
  mine,
  watchers,
  after = mine.departedAt,
  samples = INTERCEPTION_SAMPLES,
}: {
  mine: MarchingForce;
  watchers: ReadonlyArray<Watcher>;
  after?: number;
  samples?: number;
}): ReadonlyArray<Sighting> {
  const startedAt = Math.max(mine.departedAt, after);
  const span = mine.arrivesAt - startedAt;
  if (span <= 0 || watchers.length === 0) return [];
  const step = span / samples;

  const windows = new Map<string, { from: number; to: number }>();
  for (let index = 0; index <= samples; index += 1) {
    const at = startedAt + index * step;
    const here = positionAt(mine, at);
    for (const watcher of watchers) {
      if (distanceKm(here, watcher.point) > watcher.radiusKm) continue;
      const window = windows.get(watcher.id);
      if (window === undefined) windows.set(watcher.id, { from: at, to: at });
      else window.to = at;
    }
  }
  return [...windows].map(([id, window]) => ({ id, from: window.from, to: window.to }));
}
