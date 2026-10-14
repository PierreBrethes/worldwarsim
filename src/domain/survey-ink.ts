import { LAST_KNOWN_HOURS } from '../../convex/constants';

/** What is left of the ink of a survey nobody has renewed, the day it is wiped. @a-mesurer */
const FADED = 0.2;

/**
 * **The ink of a survey annotation** (F2): full while the force is in sight (`null`), paling
 * with the minutes since it was last seen, down to a trace when the last known position goes.
 */
export function surveyInk(seenMinutesAgo: number | null): number {
  if (seenMinutesAgo === null) return 1;
  const age = Math.min(1, Math.max(0, seenMinutesAgo / (LAST_KNOWN_HOURS * 60)));
  return 1 - (1 - FADED) * age;
}
