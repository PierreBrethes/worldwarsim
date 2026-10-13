import type { LonLat } from './geo';

export type ReachedOutpost = {
  readonly id: string;
  readonly lonLat: LonLat;
  /** Served by the caller from the point's level: the domain does not read the backend's tables. */
  readonly reachKm: number;
  readonly standsAt: number | null;
};

/**
 * The reach a point of mine has just earned: it stood up, or its reach grew. A point absent from
 * the previous view is not one that was raised — it is what the map opened on, and stays silent.
 */
export function raisedReaches(
  before: ReadonlyArray<ReachedOutpost>,
  now: ReadonlyArray<ReachedOutpost>,
): ReadonlyArray<{ readonly at: LonLat; readonly km: number }> {
  return now.flatMap((point) => {
    const was = before.find((candidate) => candidate.id === point.id);
    const rose =
      was !== undefined &&
      point.standsAt === null &&
      (was.standsAt !== null || point.reachKm > was.reachKm);
    return rose ? [{ at: point.lonLat, km: point.reachKm }] : [];
  });
}
