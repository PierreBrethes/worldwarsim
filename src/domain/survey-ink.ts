import { LAST_KNOWN_HOURS } from '../../convex/constants';

/** @a-mesurer — the ink left on a survey nobody renewed, the day it is wiped: a trace, read by eye. */
const SURVEY_INK_FADED = 0.2;

/**
 * **The hour a survey carries** (H3, one rule for camps and threads): a force in sight, the hour
 * it was first seen; a last known position, the hour it was last seen. Instants, as served —
 * never an age against the clock, which drifts with every render.
 */
export const surveyedAt = (survey: {
  readonly since: number;
  readonly lastSeenAt: number | null;
}): number => survey.lastSeenAt ?? survey.since;

/**
 * **The ink of a survey annotation** (F2): full while the force is in sight (`null`), paling
 * with the minutes since it was last seen, down to a trace when the last known position goes.
 */
export function surveyInk(seenMinutesAgo: number | null): number {
  if (seenMinutesAgo === null) return 1;
  const age = Math.min(1, Math.max(0, seenMinutesAgo / (LAST_KNOWN_HOURS * 60)));
  return 1 - (1 - SURVEY_INK_FADED) * age;
}
