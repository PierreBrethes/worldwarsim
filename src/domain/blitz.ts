import { distanceKm, type LonLat } from './geo';
import type { PassMode } from './combat';
import { INTERCEPTION_SAMPLES, positionAt, type MarchingForce } from './interception';
import type { Theatre } from './theatres';

/**
 * **A Blitz crosses its theatre in a quarter of an hour or so** (B1, 14/10): the pace is read off
 * the theatre rather than written per theatre, so a box redrawn tomorrow keeps the evening.
 *
 * @a-mesurer the decision says 15 to 20 minutes; nothing has played one yet
 */
export const BLITZ_CROSSING_MINUTES = 18;

export function withinTheatre(theatre: Theatre, [lon, lat]: LonLat): boolean {
  const { west, south, east, north } = theatre.box;
  if (lat < south || lat > north) return false;
  return [lon, lon + 360].some((candidate) => candidate >= west && candidate <= east);
}

/** The theatre's longer side, east-west read at its middle latitude. */
function spanKm(theatre: Theatre): number {
  const { west, south, east, north } = theatre.box;
  const middle = (south + north) / 2;
  return Math.max(
    distanceKm([west, south], [west, north]),
    distanceKm([west, middle], [west + (east - west) / 2, middle]) * 2,
  );
}

/** What a thousand kilometres of land cost on this theatre's clock. */
export const theatreMinutesPer1000Km = (theatre: Theatre): number =>
  (BLITZ_CROSSING_MINUTES * 1000) / spanKm(theatre);

export type PursuitVerdict = 'strike' | 'lost' | 'chase';

/** **Contact first, sight second** (B18): what stands within reach is struck, seen or not. */
export function pursuitVerdict({
  gapKm,
  seen,
  reachKm,
}: {
  gapKm: number;
  seen: boolean;
  reachKm: number;
}): PursuitVerdict {
  if (gapKm <= reachKm) return 'strike';
  return seen ? 'chase' : 'lost';
}

/**
 * The first instant in `[from, to]` the two forces stand within `reachKm`, or `null`. Sampled, not
 * solved: a closed form on two broken great-circle paths is a quartic per pair of segments, and
 * one step of error weighs nothing against a reach nobody has measured.
 * The medium is not read — a pursuit is an order, and the table of damage says who can touch.
 */
export function contactAt(
  a: MarchingForce,
  b: MarchingForce,
  reachKm: number,
  from: number,
  to: number,
  samples = INTERCEPTION_SAMPLES,
): number | null {
  for (let index = 0; index <= samples; index += 1) {
    const at = from + ((to - from) * index) / samples;
    if (distanceKm(positionAt(a, at), positionAt(b, at)) <= reachKm) return at;
  }
  return null;
}

/** **Charge against charge is a shock** (B17): both fire together when each was aimed at the
 *  other. Whoever strikes a target posed, or busy chasing somebody else, has the initiative. */
export const passModeOf = (
  attackerTroopIds: ReadonlyArray<string>,
  targetPursues: string | null,
): PassMode =>
  targetPursues !== null && attackerTroopIds.includes(targetPursues) ? 'shock' : 'initiative';
