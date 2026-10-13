import { outpostReachKm } from '../../convex/constants';
import type { LonLat } from './geo';

type Point = {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly level: number;
  readonly standsAt: number | null;
};

/**
 * The reach a point of mine has just earned: it stood up, or its level rose. A point absent from
 * the previous view is not one that was raised — it is what the map opened on, and stays silent.
 */
export function raisedReaches(
  before: ReadonlyArray<Point>,
  now: ReadonlyArray<Point>,
): ReadonlyArray<{ readonly at: LonLat; readonly km: number }> {
  return now.flatMap((point) => {
    const was = before.find((candidate) => candidate.id === point.id);
    const rose =
      was !== undefined &&
      point.standsAt === null &&
      (was.standsAt !== null || point.level > was.level);
    return rose ? [{ at: point.lonLat, km: outpostReachKm(point.level) }] : [];
  });
}
