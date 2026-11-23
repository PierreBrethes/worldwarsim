import { distanceKm, type LonLat } from './geo';
import { CAPITAL_BY_NATION } from './nations';
import { NATIONS, type Nation } from './ids';
import { STRATEGIC_POINTS, type StrategicPointKey } from './strategic-points';

/** @a-mesurer placeholders for the lobby sheet, not game rules. */
const NEIGHBOR_REACH_KM = 3500;
const NEAR_POINT_REACH_KM = 3000;
const MAX_NEIGHBORS = 3;
const MAX_NEAR_POINTS = 2;

/** The items within `reach` of `home`, nearest first, at most `max`; a tie keeps the input order. */
function nearest<T>(
  home: LonLat,
  items: ReadonlyArray<T>,
  placeOf: (item: T) => LonLat,
  reach: number,
  max: number,
): T[] {
  return items
    .map((item) => ({ item, km: distanceKm(home, placeOf(item)) }))
    .filter(({ km }) => km <= reach)
    .sort((a, b) => a.km - b.km)
    .slice(0, max)
    .map(({ item }) => item);
}

/**
 * **What a nation's lobby sheet says of the map**: the capitals within reach, and the drawn points
 * within reach of its capital, nearest first. Computed, never a hand-kept table.
 */
export function briefOf(
  nation: Nation,
  points: ReadonlyArray<StrategicPointKey>,
): { neighbors: Nation[]; nearPoints: StrategicPointKey[] } {
  const home = CAPITAL_BY_NATION[nation];
  const others = NATIONS.filter((other) => other !== nation);
  return {
    neighbors: nearest(
      home,
      others,
      (other) => CAPITAL_BY_NATION[other],
      NEIGHBOR_REACH_KM,
      MAX_NEIGHBORS,
    ),
    nearPoints: nearest(
      home,
      points,
      (key) => STRATEGIC_POINTS[key],
      NEAR_POINT_REACH_KM,
      MAX_NEAR_POINTS,
    ),
  };
}
