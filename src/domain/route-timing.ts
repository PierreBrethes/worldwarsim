import { COST_BY_MEDIUM, TRANSFER_COST, type ComputedRoute, type Medium, type RouteLeg } from './routing';

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

/** Air is not weighted: its distance *is* its cost, exactly as `airRoute` computes it. */
export const legCost = (leg: RouteLeg): number =>
  leg.medium === 'air' ? leg.distanceUnits : leg.distanceUnits * COST_BY_MEDIUM[leg.medium];

export const unrolledCost = (route: ComputedRoute): number =>
  route.legs.reduce((sum, leg) => sum + legCost(leg), 0) +
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
      share: legCost(leg) / total,
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
