import { destinationPoint, distanceKm, type LonLat } from './geo.ts';
import type { DepositKey } from './ids';

/**
 * **Le bassin d'un gisement** (#239, maquette `WWS/prototypes/gisements/bassin.html`) : le
 * contour, à la plume, d'un terrain qu'on lit autour du point, cuit dans
 * `public/deposit-basins.json` par `scripts/generate-deposit-basins.mjs`. Décor : la pose vise le
 * point, jamais le bassin, et aucune règle ne le lit.
 *
 * `ring` est `[lon, lat, lon, lat…]`, le contour fermé implicitement, étoilé autour de `at` :
 * le moteur le remplit en éventail depuis lui.
 */
export type DepositBasin = {
  readonly id: string;
  readonly deposit: DepositKey;
  /** Le point du gisement, d'où part l'éventail. */
  readonly at: LonLat;
  readonly ring: ReadonlyArray<number>;
};

/** @a-mesurer — le rayon du bassin dessiné : plus étroit que l'aimant, c'est le terrain qu'on lit. */
export const BASIN_KM = 24;

/** Les sommets du contour : assez pour qu'il ondule sans facettes. */
const RING_POINTS = 32;
/** Le plus loin que le bord ondule, en part du rayon (`edge`). */
const EDGE_MAX = 1.25;
/** Un bassin s'aplatit du nord au sud, comme dans la maquette. */
export const BASIN_FLATTENING = 0.8;

const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
const edge = (seed: number, a: number) =>
  1 + 0.16 * Math.sin(a * 2 + seed) + 0.09 * Math.sin(a * 5 + seed * 1.7);
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Chaque bassin, dans l'ordre des gisements. Deux puits proches (la Ruhr, la Sarre) se partagent
 * l'écart qui les sépare : un bassin rétrécit jusqu'à la moitié de la distance à son plus proche
 * voisin, pour que deux textures ne se mêlent jamais.
 */
export function basinsOf(
  points: ReadonlyArray<{
    readonly id: string;
    readonly deposit: DepositKey;
    readonly lonLat: LonLat;
  }>,
): DepositBasin[] {
  return points.map(({ id, deposit, lonLat }) => {
    const nearest = Math.min(
      ...points.filter((other) => other.id !== id).map((other) => distanceKm(lonLat, other.lonLat)),
    );
    const radius = Math.min(BASIN_KM, nearest / 2 / EDGE_MAX);
    const seed = seedOf(id);
    const ring = Array.from({ length: RING_POINTS }, (_, i) => {
      const a = (i / RING_POINTS) * Math.PI * 2;
      const [dx, dy] = [Math.cos(a), Math.sin(a) * BASIN_FLATTENING];
      const point = destinationPoint(
        lonLat,
        radius * edge(seed, a) * Math.hypot(dx, dy),
        (Math.atan2(dx, -dy) * 180) / Math.PI,
      );
      return [round(point[0]), round(point[1])];
    }).flat();
    return { id, deposit, at: lonLat, ring };
  });
}
