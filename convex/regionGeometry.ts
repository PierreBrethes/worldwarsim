import type { LonLat } from '../src/domain/geo';
import {
  decodeRegionRaster,
  firstRegionEntry,
  goalCellsOfRegions,
  hostAmong,
  hostAt,
  isRegionBorderCell,
  regionAt,
  type RegionEntry,
  type RegionRaster,
  type RegionRasterAsset,
} from '../src/domain/region-raster';
import type { World } from '../src/domain/world';
import rasterAsset from '../public/region-grid.json';
import projectionAsset from '../public/projection.json';
import { regionFacts } from './regions';

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
): ReadonlyMap<number, { readonly regionId: string; readonly point?: LonLat }> =>
  goalCellsOfRegions(rasterOf(), regions);

/**
 * **Le point gravé d'un retour chargé est-il un vrai franchissement ?** (`plunder.ts`) Deux
 * réponses valent oui, parce que le planificateur n'en produit que deux : une cellule de bordure
 * de la région, ce que rend `firstRouteEntryInRegion` ; et le **point de la région elle-même**,
 * quand elle est plus petite qu'une cellule et qu'aucune ne porte son code — neuf cent
 * soixante-et-onze régions sont dans ce cas, dont Westminster, où siège un quartier général.
 * Pour celles-là le point est la seule adresse qu'elles aient, et c'est exactement celui que
 * `goalCellsForRegions` sert.
 */
export function isRouteEntryPoint(point: LonLat, regionId: string): boolean {
  if (isRegionBorderCell(rasterOf(), point, regionId)) return true;
  const facts = regionFacts(regionId);
  return facts !== null && facts.point[0] === point[0] && facts.point[1] === point[1];
}
