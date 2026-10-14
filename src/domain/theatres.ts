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
}

export const THEATRES = [
  { id: 'europe', box: { west: -12, south: 34, east: 45, north: 72 } },
  { id: 'mediterranean', box: { west: -10, south: 28, east: 42, north: 46 } },
  { id: 'pacific', box: { west: 95, south: -45, east: 240, north: 55 } },
  { id: 'americas', box: { west: -130, south: -55, east: -35, north: 60 } },
] as const satisfies readonly Theatre[];

export type TheatreId = (typeof THEATRES)[number]['id'];

export const theatreById = (id: string): Theatre | null =>
  THEATRES.find((theatre) => theatre.id === id) ?? null;

export function theatreCenter(theatre: Theatre): LonLat {
  const { west, south, east, north } = theatre.box;
  const lon = (west + east) / 2;
  return [lon > 180 ? lon - 360 : lon, (south + north) / 2];
}
