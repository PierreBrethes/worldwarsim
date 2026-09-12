import type { LonLat } from '../src/domain/geo';
import {
  cellsOfRegion,
  decodeRegionRaster,
  firstRegionEntry,
  goalCellsOfRegions,
  hostAmong,
  hostAt,
  isRegionBorderCell,
  regionAt,
  type RegionEntry,
  type RegionGoal,
  type RegionRaster,
  type RegionRasterAsset,
} from '../src/domain/region-raster';
import type { World } from '../src/domain/world';
import rasterAsset from '../public/region-grid.json';
import projectionAsset from '../public/projection.json';

/**
 * **La géographie du serveur, et elle ne porte plus un seul polygone** (ADR 0023). Les contours
 * admin-1 et les frontières de pays entraient ici par `import` : 22,6 Mio de tas pour
 * `regions.json`, 11,5 pour `world.json` — payés par **tout** module qui touche une règle de
 * carte, parce qu'un `import` s'évalue au chargement du module et non au premier appel, et
 * retenus tant que l'isolat vit. La production les recyclait en boucle
 * (`TooMuchMemoryCarryOver`), et chaque appel suivant repartait à froid.
 *
 * Le raster est cuit hors ligne (`scripts/generate-region-grid.mjs`) à la maille exacte de la
 * grille de routage : **une cellule, un indice** — les buts rendus ici sont directement les
 * cellules que Dijkstra parcourt, sans conversion. Il se décode à la première demande, comme la
 * grille, en deux tampons hors tas.
 *
 * Ce qu'on y perd est nommé : la frontière n'est plus exacte au flottant, elle est exacte à la
 * cellule, et la cellule est le modèle.
 */
const world = {
  sphere: projectionAsset.sphere,
  outline: projectionAsset.outline,
  countries: [],
} as unknown as World;

let raster: RegionRaster | null = null;
const rasterOf = (): RegionRaster =>
  (raster ??= decodeRegionRaster(rasterAsset as unknown as RegionRasterAsset, world));

export const regionAtRoutePoint = (point: LonLat): string | null => regionAt(rasterOf(), point);

export const hostAtRoutePoint = (point: LonLat): string | null => hostAt(rasterOf(), point);

export const hostAmongAtRoutePoint = (point: LonLat, adm0s: ReadonlySet<string>): string | null =>
  hostAmong(rasterOf(), point, adm0s);

export const firstRouteEntryInRegion = (
  points: ReadonlyArray<LonLat>,
  regionId: string,
): RegionEntry | null => firstRegionEntry(rasterOf(), points, regionId);

export const goalCellsForRegions = (
  regions: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
): ReadonlyMap<number, ReadonlyArray<RegionGoal>> => goalCellsOfRegions(rasterOf(), regions);

/** Les cellules d'une région, totales : celles du raster, ou sa cellule d'ancrage (ADR 0023). */
export const routeCellsOfRegion = (regionId: string): ReadonlyArray<number> =>
  cellsOfRegion(rasterOf(), regionId);

/**
 * **Le point gravé d'un retour chargé est-il un vrai franchissement ?** (`plunder.ts`) La
 * question se pose à la cellule et à rien d'autre depuis l'ancrage : `isRegionBorderCell` lit
 * `cellsOfRegion`, donc une région plus petite qu'une cellule — neuf cent soixante-et-onze le
 * sont, les régions maltaises comme les arrondissements d'une capitale — est **toute** bordure
 * de sa cellule d'ancrage, et y arriver est y entrer.
 *
 * Le repli d'égalité exacte sur le point de la région est parti avec elle : il disait la même
 * chose au flottant près, sur la seule adresse que ces régions avaient, et deux façons de
 * répondre à une question sont une de trop.
 */
export const isRouteEntryPoint = (point: LonLat, regionId: string): boolean =>
  isRegionBorderCell(rasterOf(), point, regionId);
