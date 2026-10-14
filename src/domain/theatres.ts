import type { LonLat } from './geo';

export interface Theatre {
  readonly id: string;
  /** Degrees. `east` may exceed 180 so a box can cross the antimeridian (the Pacific). */
  readonly box: {
    readonly west: number;
    readonly south: number;
    readonly east: number;
    readonly north: number;
  };
  /** How many players its starting map seats fairly (T1): the placement tests fix it, six seeds
   *  each (`convex/blitz.test.ts`). Europe at four failed one seed in six (14/10). */
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
    players: { min: 2, max: 3 },
  },
  {
    id: 'pacific',
    box: { west: 95, south: -45, east: 240, north: 55 },
    players: { min: 2, max: 2 },
  },
  {
    id: 'americas',
    box: { west: -130, south: -55, east: -35, north: 60 },
    players: { min: 2, max: 3 },
  },
] as const satisfies readonly Theatre[];

export type TheatreId = (typeof THEATRES)[number]['id'];

export const theatreById = (id: string): Theatre | null =>
  THEATRES.find((theatre) => theatre.id === id) ?? null;

export function theatreCenter(theatre: Theatre): LonLat {
  const { west, south, east, north } = theatre.box;
  const lon = (west + east) / 2;
  return [lon > 180 ? lon - 360 : lon, (south + north) / 2];
}
