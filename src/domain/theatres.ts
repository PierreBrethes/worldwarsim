import { distanceKm, type LonLat } from './geo';

export interface Theatre {
  readonly id: string;
  /** Degrees. `east` may exceed 180 so a box can cross the antimeridian (the Pacific). */
  readonly box: {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
  };
  /** How many players its starting map seats fairly (T1): the ceiling holds on six seeds in the
   *  placement tests (`convex/blitz.test.ts`), or it comes down a step. */
  readonly players: { readonly min: number; readonly max: number };
}

export const THEATRES = [
  {
    id: 'europe',
    box: { west: -12, south: 34, east: 45, north: 72 },
    players: { min: 2, max: 4 },
  },
  {
    id: 'mediterranean',
    box: { west: -10, south: 28, east: 42, north: 46 },
    players: { min: 2, max: 4 },
  },
  {
    id: 'pacific',
    box: { west: 95, south: -45, east: 240, north: 55 },
    players: { min: 2, max: 3 },
  },
  {
    id: 'americas',
    box: { west: -130, south: -55, east: -35, north: 60 },
    players: { min: 2, max: 4 },
  },
] as const satisfies readonly Theatre[];

export type TheatreId = (typeof THEATRES)[number]['id'];

export const theatreById = (id: string): Theatre | null =>
  THEATRES.find((theatre) => theatre.id === id) ?? null;

/** The theatre a view plays on, `null` for a Mondiale. */
export const playedTheatre = (view: {
  readonly mode: string;
  readonly theatre: string | null;
}): Theatre | null =>
  view.mode === 'blitz' && view.theatre !== null ? theatreById(view.theatre) : null;

export function theatreCenter(theatre: Theatre): LonLat {
  const { west, south, east, north } = theatre.box;
  const lon = (west + east) / 2;
  return [lon > 180 ? lon - 360 : lon, (south + north) / 2];
}

/** The longer of its two crossings: the distance every Blitz clock and reach is cut from. */
export function spanKm(theatre: Theatre): number {
  const { west, south, east, north } = theatre.box;
  const middle = (south + north) / 2;
  return Math.max(
    distanceKm([west, south], [west, north]),
    distanceKm([west, middle], [west + (east - west) / 2, middle]) * 2,
  );
}

/**
 * **Every Blitz distance is a share of its theatre** (A2), as its pace is: contact, sight, fire,
 * the starting map. One rule, so the Pacific plays the Europe evening on a map four times wider;
 * the shares are cut so Europe keeps the kilometres it had.
 */
export const theatreKm = (theatre: Theatre, share: number): number => share * spanKm(theatre);
