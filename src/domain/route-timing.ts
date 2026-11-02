import { distanceKm, type LonLat } from './geo';
import { INTERCEPTION_SAMPLES, positionAt } from './interception';
import {
  COST_BY_MEDIUM,
  TRANSFER_COST,
  type ComputedRoute,
  type Medium,
  type RouteLeg,
} from './routing';

/**
 * A route's time, and nothing else. `ComputedRoute` gives a geometry and a global cost; the
 * thread and the segmented scale need the breakdown: how much time on each leg, how much at
 * the dock. This module stays pure — the geometry, in turn, is projected by the engine, which
 * alone knows the frame.
 */
export type UnrolledSegment =
  | {
      readonly kind: 'leg';
      readonly medium: Medium;
      readonly legIndex: number;
      readonly share: number;
    }
  | {
      readonly kind: 'dock';
      /** The dock precedes leg `legIndex`; we embark when that leg is at sea. */
      readonly embarking: boolean;
      readonly legIndex: number;
      readonly share: number;
    };

/**
 * Where the pawn is at instant `t`. Discriminated union: at the dock it structurally has no
 * local fraction, so nothing can make it drift while it waits.
 */
export type TemporalPosition =
  | { readonly kind: 'leg'; readonly legIndex: number; readonly local: number }
  | { readonly kind: 'dock'; readonly legIndex: number };

/**
 * Air is not weighted: its distance *is* its cost, exactly as `airRoute` computes it. The ground
 * is priced at what the column actually paid — a motorized route weighted at 1.15 repriced at 1.6
 * here would put the pawn on the wrong leg of a crossing, which is the display lie the whole
 * `landCost` field exists to prevent.
 */
export const legCost = (leg: RouteLeg, landCost = COST_BY_MEDIUM.land): number =>
  leg.medium === 'air'
    ? leg.distanceUnits
    : leg.distanceUnits * (leg.medium === 'sea' ? COST_BY_MEDIUM.sea : landCost);

export const unrolledCost = (route: ComputedRoute): number =>
  route.legs.reduce((sum, leg) => sum + legCost(leg, route.landCost), 0) +
  Math.max(0, route.legs.length - 1) * TRANSFER_COST;

/**
 * The shares sum to 1 by construction: they are normalized on the recomputed cost and not on
 * `costUnits`, otherwise a rounding gap would leave the pawn a hair short of arrival.
 */
export function unrollRoute(route: ComputedRoute): ReadonlyArray<UnrolledSegment> {
  const total = unrolledCost(route);
  if (total <= 0) return [];

  const segments: UnrolledSegment[] = [];
  route.legs.forEach((leg, index) => {
    if (index > 0) {
      segments.push({
        kind: 'dock',
        embarking: leg.medium === 'sea',
        legIndex: index,
        share: TRANSFER_COST / total,
      });
    }
    segments.push({
      kind: 'leg',
      medium: leg.medium,
      legIndex: index,
      share: legCost(leg, route.landCost) / total,
    });
  });
  return segments;
}

/**
 * Where to place the pawn on the thread. At the dock it parks at the end of the leg it just
 * finished: that is what keeps it motionless during the transfer, with no loop having to
 * remember anything from one frame to the next.
 */
export const pawnTarget = (
  position: TemporalPosition,
): { readonly legIndex: number; readonly local: number } =>
  position.kind === 'dock'
    ? { legIndex: position.legIndex - 1, local: 1 }
    : { legIndex: position.legIndex, local: position.local };

export function temporalPosition(
  unrolled: ReadonlyArray<UnrolledSegment>,
  t: number,
): TemporalPosition {
  const clamped = Math.min(1, Math.max(0, t));
  // Shares add up in floating point: at arrival the sum lands a hair under 1 and the pawn
  // would stop just short of its destination. The last step is therefore placed by hand.
  const last = unrolled[unrolled.length - 1];
  if (clamped >= 1 && last !== undefined) {
    return last.kind === 'dock'
      ? { kind: 'dock', legIndex: last.legIndex }
      : { kind: 'leg', legIndex: last.legIndex, local: 1 };
  }
  let start = 0;
  for (const segment of unrolled) {
    const end = start + segment.share;
    if (clamped < end || segment === unrolled[unrolled.length - 1]) {
      if (segment.kind === 'dock') return { kind: 'dock', legIndex: segment.legIndex };
      const local = segment.share > 0 ? (clamped - start) / segment.share : 1;
      return {
        kind: 'leg',
        legIndex: segment.legIndex,
        local: Math.min(1, Math.max(0, local)),
      };
    }
    start = end;
  }
  return { kind: 'leg', legIndex: 0, local: 0 };
}

/** Un relais et ce qu'il couvre : le rayon voyage avec le point depuis qu'il suit son niveau. */
export type Relay = { readonly point: LonLat; readonly reachKm: number };

/**
 * **What a logistics relay covers of a road, as a share of its length** (design sheet 03).
 *
 * The road is walked the way the interception walks it — the same sampled path against the same
 * point/circle test (`positionAt`, `INTERCEPTION_SAMPLES`). A second geometry for the same
 * question is a second answer waiting to disagree with the first, and the two questions really
 * are one: "what stretch of this march passes within a relay's own reach of that point" — chaque
 * relais porte son rayon, qui suit son niveau (`outpostReachKm`, 31/08).
 *
 * **The share is measured on the road, never on the legs**, and that is a deliberate reading of
 * a sheet that says "leg". A `RouteLeg` is a run of one medium — the Dijkstra's own bookkeeping,
 * with no geometry attached to it and no relation whatsoever to where a relay stands. Speeding
 * up a whole ocean crossing because its first mile grazed a relay is not what the sheet asks
 * for; what it asks for is that the ground a relay watches be walked faster, and that ground is
 * a stretch of polyline.
 */
export const relayedShare = ({
  points,
  relays,
  samples = INTERCEPTION_SAMPLES,
}: {
  points: ReadonlyArray<LonLat>;
  relays: ReadonlyArray<Relay>;
  samples?: number;
}): number => {
  if (relays.length === 0 || points.length < 2) return 0;
  const road = { id: 'route', points, departedAt: 0, arrivesAt: 1 };

  let covered = 0;
  for (let index = 0; index <= samples; index += 1) {
    const here = positionAt(road, index / samples);
    if (relays.some((relay) => distanceKm(here, relay.point) <= relay.reachKm)) covered += 1;
  }
  return covered / (samples + 1);
};

/**
 * **The route repriced by the relays that watch it**, in the cost units `routeMinutes` reads.
 *
 * Only the ground and the water are accelerated: the transfers are the eight units it takes to
 * put a column on a hull (`TRANSFER_COST`), and a relay does not make a quay faster. They are
 * recovered rather than stored — the route carries one total, and the legs carry what that
 * total is made of, so the difference is what the docks cost and nothing else.
 *
 * The whole computation is here, in the domain, and both roads through it call this one
 * function: the preview owes the player the hour the departure will actually write, and two
 * implementations of a duration are two hours to reconcile on the same card.
 */
export function relayedCostUnits({
  route,
  relays,
  multiplier,
  samples = INTERCEPTION_SAMPLES,
}: {
  route: ComputedRoute;
  relays: ReadonlyArray<Relay>;
  multiplier: number;
  samples?: number;
}): number {
  /** **Une liaison n'accélère pas l'air** (Pierre, 01/11) ; le routeur ne mêle jamais un vol à la
   *  terre ou à la mer (`routeMedium`), donc une route est aérienne de bout en bout ou pas du tout. */
  if (route.mode === 'air') return route.costUnits;
  const share = relayedShare({ points: route.points, relays, samples });
  if (share <= 0 || multiplier <= 0) return route.costUnits;

  const legs = route.legs.reduce((sum, leg) => sum + legCost(leg, route.landCost), 0);
  const docks = Math.max(0, route.costUnits - legs);
  return legs * (1 - share + share / multiplier) + docks;
}
