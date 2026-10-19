import { boxGapKm, distanceKm, shortestLongitudeGap, type GeoBox, type LonLat } from './geo';
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
  return pointAtDistanceShare(points, distanceProgressAt(force, at));
}

/** The share of its thread a force has walked at an instant, clamped exactly as `positionAt`. */
const walkedShareAt = (force: MarchingForce, at: number): number =>
  at <= force.departedAt ? 0 : at >= force.arrivesAt ? 1 : distanceProgressAt(force, at);

/**
 * The one walk down a polyline in this codebase. It is kept apart from the clock because a
 * sighting segment asks the same question of a share it computed itself — where does the thread
 * stand at four tenths of its length — and a second walk would be a second answer.
 */
export function pointAtDistanceShare(points: ReadonlyArray<LonLat>, share: number): LonLat {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) throw new Error('a force without a route');
  if (points.length === 1) return first;

  const { legs, total } = measured(points);
  if (total === 0) return first;

  let walked = Math.min(1, Math.max(0, share)) * total;
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
 * **A thread is measured once.** The detection pass asks where a column stands some five hundred
 * times per observer and per target, and each answer used to re-measure every vertex of the same
 * polyline — a haversine apiece. Keyed on the array itself, which a route never rewrites in
 * place (`ReadonlyArray`), and weakly, so a thread nobody holds any more is forgotten with it.
 */
const lengths = new WeakMap<
  ReadonlyArray<LonLat>,
  { readonly legs: ReadonlyArray<number>; readonly total: number }
>();

function measured(points: ReadonlyArray<LonLat>) {
  let known = lengths.get(points);
  if (known === undefined) {
    const legs = points.slice(1).map((point, index) => distanceKm(points[index]!, point));
    known = { legs, total: legs.reduce((sum, leg) => sum + leg, 0) };
    lengths.set(points, known);
  }
  return known;
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

  const { costs, total } = legCostsOf(force, legs);
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
  const { costs, total } = legCostsOf(force, legs);
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

/**
 * **A force's legs are costed once.** The detection pass asks a column for its medium and its
 * progress twice per sample, and each answer used to re-cost every leg. Keyed on the force, which
 * the pass builds once per movement and never rewrites.
 */
const legCosts = new WeakMap<
  MarchingForce,
  { readonly costs: ReadonlyArray<number>; readonly total: number }
>();

function legCostsOf(force: MarchingForce, legs: ReadonlyArray<RouteLeg>) {
  let known = legCosts.get(force);
  if (known === undefined) {
    const costs = legs.map((leg) => legCost(leg, force.landCost));
    known = {
      costs,
      total:
        costs.reduce((sum, cost) => sum + cost, 0) + Math.max(0, legs.length - 1) * TRANSFER_COST,
    };
    legCosts.set(force, known);
  }
  return known;
}

const legCost = (leg: RouteLeg, landCost = COST_BY_MEDIUM.land): number =>
  leg.medium === 'air'
    ? leg.distanceUnits
    : leg.distanceUnits * (leg.medium === 'sea' ? COST_BY_MEDIUM.sea : landCost);

/**
 * **The grid is the trip's, not the reading's** (#145). Samples are laid from the pair's common
 * departure to its first arrival, and those before `after` are dropped: a pass read at any later
 * instant walks the same instants and answers the same window, cut at `after`. A grid that
 * started at the reading moved with every pass, so a window read twice was two windows — and a
 * pass that relit only one player would have left everyone else on an older grid.
 */
function firstSampleFrom(
  sampleAt: (index: number) => number,
  samples: number,
  start: number,
  end: number,
  after: number,
): number {
  if (after <= start) return 0;
  if (end <= start) return samples + 1;
  let index = Math.min(samples + 1, Math.ceil(((after - start) / (end - start)) * samples));
  while (index > 0 && sampleAt(index - 1) >= after) index -= 1;
  while (index <= samples && sampleAt(index) < after) index += 1;
  return index;
}

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
  const from = Math.max(observer.departedAt, target.departedAt);
  const to = Math.min(observer.arrivesAt, target.arrivesAt);
  if (to < from || radiusKm <= 0) return null;
  const sampleAt = (index: number) => from + ((to - from) * index) / samples;
  const first = firstSampleFrom(sampleAt, samples, from, to, after);
  if (first > samples) return null;
  const inside = (index: number) => {
    const at = sampleAt(index);
    const observerMedium = mediumAt(observer, at);
    if (observerMedium === null || observerMedium !== mediumAt(target, at)) return false;
    return distanceKm(positionAt(observer, at), positionAt(target, at)) <= radiusKm;
  };
  /** The first sample inside, from either end: the window is its two edges, and whatever lies
   *  between them is never asked. */
  const edge = (first: number, last: number, backward: boolean): number | null => {
    if (last - first >= PRUNED_STRETCH) {
      const [start, end] = [sampleAt(first), sampleAt(last)];
      if (
        boxGapKm(stretchBox(observer, start, end), stretchBox(target, start, end)) >
        radiusKm + PRUNE_SLACK_KM
      ) {
        return null;
      }
      const middle = (first + last) >> 1;
      return backward
        ? (edge(middle + 1, last, true) ?? edge(first, middle, true))
        : (edge(first, middle, false) ?? edge(middle + 1, last, false));
    }
    for (let step = 0; step <= last - first; step += 1) {
      const index = backward ? last - step : first + step;
      if (inside(index)) return index;
    }
    return null;
  };
  /** Columns that start or end side by side answer at the first sample, before any box. */
  const opened = inside(first) ? first : edge(first, samples, false);
  if (opened === null) return null;
  const closed = inside(samples) ? samples : (edge(opened, samples, true) ?? opened);
  return { from: sampleAt(opened), to: sampleAt(closed) };
}

/**
 * **The walk skips what two boxes already answer** (#145). Every sample of a stretch of time lies
 * inside the box of the thread the force walks over that stretch; when two such boxes stand
 * further apart than the radius, no sample of the stretch can be inside it, and the stretch is
 * dropped whole. The samples that are walked are the very ones the full walk takes, in the same
 * order, so the answer is the same answer — only cheaper. Bisected, so a pair that never meets
 * costs a handful of boxes rather than two hundred and forty positions.
 */
const PRUNED_STRETCH = 8;
/** One metre: the floor and the walk round differently, and a tie must stay walked. */
const PRUNE_SLACK_KM = 0.001;

/** Longitudes unwrapped along the thread, so a stretch across the antimeridian is one span. */
const unwrapped = new WeakMap<ReadonlyArray<LonLat>, ReadonlyArray<number>>();

function unwrappedLongitudes(points: ReadonlyArray<LonLat>): ReadonlyArray<number> {
  let known = unwrapped.get(points);
  if (known === undefined) {
    const lons = [points[0]![0]];
    for (let index = 1; index < points.length; index += 1) {
      lons.push(lons[index - 1]! + shortestLongitudeGap(points[index - 1]![0], points[index]![0]));
    }
    known = lons;
    unwrapped.set(points, known);
  }
  return known;
}

/** Where on its thread a share falls: the leg and how far along it, as `pointAtDistanceShare`. */
function legAtShare(legs: ReadonlyArray<number>, total: number, share: number) {
  let walked = Math.min(1, Math.max(0, share)) * total;
  for (const [index, leg] of legs.entries()) {
    if (walked > leg && index < legs.length - 1) {
      walked -= leg;
      continue;
    }
    return { index, ratio: leg === 0 ? 0 : walked / leg };
  }
  return { index: 0, ratio: 0 };
}

/** The box of every place a force stands between two instants. */
function stretchBox(force: MarchingForce, start: number, end: number): GeoBox {
  const points = force.points;
  const lons = unwrappedLongitudes(points);
  const box = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
  const include = (lon: number, lat: number) => {
    box.south = Math.min(box.south, lat);
    box.north = Math.max(box.north, lat);
    box.west = Math.min(box.west, lon);
    box.east = Math.max(box.east, lon);
  };
  const { legs, total } = measured(points);
  if (points.length === 1 || total === 0) {
    include(lons[0]!, points[0]![1]);
    return box;
  }
  const shares = [walkedShareAt(force, start), walkedShareAt(force, end)];
  const [low, high] = shares.map((share) => legAtShare(legs, total, share)) as [
    { index: number; ratio: number },
    { index: number; ratio: number },
  ];
  for (const { index, ratio } of [low, high]) {
    include(
      lons[index]! + (lons[index + 1]! - lons[index]!) * ratio,
      points[index]![1] + (points[index + 1]![1] - points[index]![1]) * ratio,
    );
  }
  for (let index = low.index + 1; index <= high.index; index += 1) {
    include(lons[index]!, points[index]![1]);
  }
  return box;
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
  const startedAt = mine.departedAt;
  const span = mine.arrivesAt - startedAt;
  if (span <= 0 || watchers.length === 0) return [];
  const step = span / samples;
  const sampleAt = (index: number) => startedAt + index * step;
  const first = firstSampleFrom(sampleAt, samples, startedAt, mine.arrivesAt, after);
  if (first > samples) return [];

  const windows = new Map<string, { from: number; to: number }>();
  const walk = (first: number, last: number, near: ReadonlyArray<Watcher>) => {
    if (last - first >= PRUNED_STRETCH) {
      const box = stretchBox(mine, sampleAt(first), sampleAt(last));
      const nearer = near.filter(
        (watcher) =>
          boxGapKm(box, {
            south: watcher.point[1],
            north: watcher.point[1],
            west: watcher.point[0],
            east: watcher.point[0],
          }) <=
          watcher.radiusKm + PRUNE_SLACK_KM,
      );
      if (nearer.length === 0) return;
      const middle = (first + last) >> 1;
      walk(first, middle, nearer);
      walk(middle + 1, last, nearer);
      return;
    }
    for (let index = first; index <= last; index += 1) {
      const at = sampleAt(index);
      const here = positionAt(mine, at);
      for (const watcher of near) {
        if (distanceKm(here, watcher.point) > watcher.radiusKm) continue;
        const window = windows.get(watcher.id);
        if (window === undefined) windows.set(watcher.id, { from: at, to: at });
        else window.to = at;
      }
    }
  };
  walk(first, samples, watchers);
  return [...windows].map(([id, window]) => ({ id, from: window.from, to: window.to }));
}
