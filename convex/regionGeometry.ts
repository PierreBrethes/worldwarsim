import type { LonLat } from '../src/domain/geo';
import {
  cellsOfRegion,
  coveredByDisc,
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

/**
 * **Ce qu'un disque d'avant-poste touche** (révision du 17/09/2026 de l'ADR 0020 §1) : les régions
 * dont une cellule tombe dans le rayon, et la distance à la plus proche. C'est la **seule** porte
 * de cette mesure côté serveur — la couleur (`holding.ts`), le sol qu'on peut bâtir (`view.ts`) et
 * le relevé d'une fondation (`surveys.ts`) la lisent tous les trois, parce que « là où je tiens est
 * là où je peux bâtir » est une phrase et non trois fonctions.
 *
 * **Mémo par point et par rayon**, au niveau du module : la couverture d'un avant-poste ne change
 * qu'à son élévation, et une saison en compte quelques dizaines. `heldOver` est appelée plusieurs
 * fois par requête — la vue, le classement, la production, le relevé — et repayer le parcours à
 * chacune ferait payer à une query ce qu'un isolat peut retenir. La clé est le point exact et le
 * rayon : deux points voisins sont deux entrées, et un point élevé en est une troisième.
 */
const coverage = new Map<string, ReadonlyMap<string, number>>();

/**
 * **Le mémo est borné, et c'est le relevé qui l'exige** : une saison compte quelques dizaines
 * d'avant-postes, mais le relevé du sol interroge aussi les haltes d'un trajet — des points neufs
 * à chaque marche. Sans borne, l'isolat retiendrait une carte par halte, c'est-à-dire exactement
 * ce que l'ADR 0023 a sorti de la mémoire. On vide plutôt qu'on n'évince : reconstruire un disque
 * coûte moins d'une milliseconde, tenir un ordre d'ancienneté coûterait du code.
 */
const REMEMBERED_DISCS = 2048;

export function regionsWithinReach(point: LonLat, reachKm: number): ReadonlyMap<string, number> {
  const key = `${point[0]}|${point[1]}|${reachKm}`;
  const known = coverage.get(key);
  if (known !== undefined) return known;
  const covered = coveredByDisc(rasterOf(), point, reachKm);
  if (coverage.size >= REMEMBERED_DISCS) coverage.clear();
  coverage.set(key, covered);
  return covered;
}

/**
 * **Le sol qu'un jeu de portées couvre** (ADR 0020 §5), et rien de ce qui s'y trouve : la
 * couverture dit *où* l'on voit, jamais *ce qu'on y voit*. Les deux se croisent chez l'appelant,
 * seul en droit de tenir la vérité en main.
 *
 * C'est le **même disque** que la couleur (révision du 17/09) : une région qu'une portée touche
 * est relevée, comme elle serait tenue. Mesurer le relevé au pôle quand la couleur se mesure au
 * disque laisserait un joueur tenir l'Ontario sans jamais recevoir la ligne qui le lui montre —
 * une couleur invisible à celui qui la porte.
 */
export function regionsCoveredBy(
  observers: ReadonlyArray<{ readonly point: LonLat; readonly radiusKm: number }>,
): ReadonlySet<string> {
  const covered = new Set<string>();
  for (const observer of observers) {
    for (const regionId of regionsWithinReach(observer.point, observer.radiusKm).keys()) {
      covered.add(regionId);
    }
  }
  return covered;
}
