import type { LonLat } from '../src/domain/geo';
import type { ComputedRoute, Ground, RouteMode } from '../src/domain/routing';
import { distanceKm } from '../src/domain/geo';
import {
  coastCellsIn,
  computeRoute,
  computeRouteToAny,
  decodeGrid,
  isCoastCell,
  groundAt,
  isLandCell,
  extendRouteSearch,
  routeDistanceKmAt,
  routeDistanceKmField,
  truncateRouteSearch,
  KM_PER_UNIT,
} from '../src/domain/routing';
import type { Projection } from '../src/domain/world';
import gridAsset from '../public/grid.json';
import projectionAsset from '../public/projection.json';
import {
  firstRouteEntryInRegion,
  goalCellsForRegions,
  hostAmongAtRoutePoint,
  hostAtRoutePoint,
  regionAtRoutePoint,
  pointInRouteRegion,
} from './regionGeometry';

/**
 * The routing grid of ADR 0012, on the server side — because that is where the ADR says the
 * calculation lives: a client that computes its own routes also picks its own speeds.
 *
 * **No polygon enters this bundle any more** (ADR 0023): the old `world.json` weighed 1.27 MB of country
 * rings and 11,5 MiB of isolate heap, for the one question `hostAtPoint` asks. That question is
 * answered off the baked region raster now, on the very cells this grid is made of, and what is
 * left of the world here is its frame — `projection.json`, 4 Ko, enough to project a lon/lat.
 * A Dijkstra pass still costs 13 ms from Paris to Berlin, 125 ms from Tokyo to Los Angeles.
 *
 * **The raster is no longer computed here — it is baked** (`scripts/generate-grid.mjs`, 65 Ko of
 * run-length pairs) and decoded at the first demand of the isolate. The 31 ms of `buildGrid` were
 * measured warm, on a development machine; cold and without a JIT they are seconds, and a query
 * has one — `view:playerView` reads `afloat` and `coastal` off this grid for every standing
 * column, and was intermittently timing out on the first call of a fresh isolate. Decoding is a
 * handful of `fill` calls instead, and the first movement of the season still pays for it rather
 * than the import: most mutations never route anything.
 */
const projection = projectionAsset as unknown as Projection;

let grid: ReturnType<typeof decodeGrid> | null = null;

/**
 * **One cell of the raster, in kilometres.** It is the step a heading is prolonged by when a
 * truncated sighting has to guess whether a column is coming (`headingReachesMe`): the mesh of
 * this grid is the finest at which this world can say whose ground a point is, so sampling any
 * tighter would ask the same cell the same question twice.
 */
export const GRID_STEP_KM = gridAsset.step * KM_PER_UNIT;

export function routeBetween(
  from: LonLat,
  to: LonLat,
  mode: RouteMode,
  landCost?: number,
): ComputedRoute | null {
  grid ??= decodeGrid(gridAsset, projection);
  return computeRoute(grid, from, to, mode, landCost);
}

export function routeToRegions(
  from: LonLat,
  regions: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
  mode: RouteMode,
  landCost?: number,
):
  | { readonly kind: 'standing'; readonly regionId: string; readonly point: LonLat }
  | {
      readonly kind: 'route';
      readonly regionId: string;
      readonly point: LonLat;
      readonly route: ComputedRoute;
    }
  | null {
  const regionIds = new Set(regions.map((region) => region.id));
  const here = regionAtRoutePoint(from);
  if (here !== null && regionIds.has(here))
    return { kind: 'standing', regionId: here, point: from };

  grid ??= decodeGrid(gridAsset, projection);
  const goals = goalCellsForRegions(regions);
  const search = computeRouteToAny(grid, from, new Set(goals.keys()), mode, landCost);
  if (search === null) return null;
  const reached = goals.get(search.goalCell);
  if (reached === undefined) return null;

  /**
   * **Une cellule d'arrivée peut répondre pour plusieurs régions** (ADR 0023) : la sienne, celle
   * du canal, et toutes celles qui s'y ancrent faute d'être assez grandes pour une cellule à
   * elles. On les essaie dans l'ordre servi — le raster d'abord — et la première qui se laisse
   * atteindre est la destination.
   */
  for (const goal of reached) {
    /**
     * **Une région plus petite qu'une cellule n'a pas de frontière à franchir** : aucune cellule
     * ne porte son code, elle est ancrée, et la route prolongée jusqu'à son point *est* l'entrée.
     * Chercher un franchissement dans le raster n'en trouverait aucun et refuserait la livraison.
     */
    if (goal.point !== undefined) {
      if (mode !== 'air' && !isLandCell(grid, goal.point)) continue;
      const completed = extendRouteSearch(grid, search, goal.point);
      return { kind: 'route', regionId: goal.regionId, point: goal.point, route: completed.route };
    }

    const entry = firstRouteEntryInRegion(search.rawPoints, goal.regionId);
    if (entry === null) continue;
    return {
      kind: 'route',
      regionId: goal.regionId,
      point: entry.point,
      route: truncateRouteSearch(grid, search, entry.segmentIndex, entry.fraction, entry.point),
    };
  }
  return null;
}

/**
 * **Is this a coast the routing can sail from?** The very grid a movement is computed on
 * answers, so a port accepted here is a port a cargo leaves from without a land leg. A port
 * refused here would have been a quay Dijkstra never found water beside.
 *
 * It is the client's own reading too (`isCoastCell`): the ghost snaps onto the cells this
 * returns true for, and the click that follows cannot be refused for the reason it was aimed at.
 */
export function coastAtPoint(point: LonLat): boolean {
  grid ??= decodeGrid(gridAsset, projection);
  return isCoastCell(grid, point);
}

/**
 * **Le quai d'une région, chez elle** : sa cellule côtière la plus proche de son point, lue sur la
 * grille de routage, et dont le raster dit qu'elle est de cette région. Un quai cherché autour du
 * point sans cette garde tombait chez le voisin, souvent dans un autre pays. `null` : la région
 * n'a pas de cellule côtière à elle (`blitz.place`).
 */
export function quayOfRegion(regionId: string, point: LonLat): LonLat | null {
  let best: LonLat | null = null;
  let bestKm = Infinity;
  for (const quay of quaysByRegion().get(regionId) ?? []) {
    const km = distanceKm(point, quay);
    if (km < bestKm) [best, bestKm] = [quay, km];
  }
  return best;
}

let quays: ReadonlyMap<string, ReadonlyArray<LonLat>> | null = null;
function quaysByRegion(): ReadonlyMap<string, ReadonlyArray<LonLat>> {
  if (quays !== null) return quays;
  grid ??= decodeGrid(gridAsset, projection);
  const { minX, minY, maxX, maxY } = grid.sphere;
  const found = new Map<string, LonLat[]>();
  for (const { lonLat } of coastCellsIn(grid, [minX, minY, maxX, maxY])) {
    const regionId = regionAtRoutePoint(lonLat);
    if (regionId === null) continue;
    const list = found.get(regionId);
    if (list === undefined) found.set(regionId, [lonLat]);
    else list.push(lonLat);
  }
  return (quays = found);
}

export function landAtPoint(point: LonLat): boolean {
  return groundAtPoint(point) === 'land';
}

/** Le sol que la visée a lu (`MapEngine.groundAt`), sur la même grille. */
export function groundAtPoint(point: LonLat): Ground {
  grid ??= decodeGrid(gridAsset, projection);
  return groundAt(grid, point);
}

/**
 * **The country hosting a point, as every rule keys it**: an `adm0_a3`, or the empty string on
 * the open sea and nowhere else. One asset, one reading — the region raster carries the region and
 * its host country on the same cell, so the containment and the code cannot disagree.
 *
 * The empty string used to swallow both "this is the high sea" and "this is a country nobody
 * plays", which made Arabia, Romania and Bolivia one and the same host. They are the ordinary
 * case, not the edge: the decreasing yield per host, the finite trade capacity and the
 * expulsion of fiche 03 all key on this string, and none of them can be written on a key that
 * collapses a hundred and fifty-five countries into one.
 *
 * **It is containment that answers, never the closest region.** Reading a host off the nearest
 * region point put Menton in Monaco and Aix-la-Chapelle in Belgium: a pole of inaccessibility
 * says where a region *is*, and says nothing whatsoever about where it stops. The containment is
 * baked now (ADR 0023) — the cell of the point carries the country whose polygon covered its
 * centre — so the answer is the polygon's, at the mesh of the grid the movement walks.
 */
export function hostAtPoint(point: LonLat): string {
  return hostAtRoutePoint(point) ?? '';
}

export function pointInRegion(
  point: LonLat,
  region: { readonly id: string; readonly point: LonLat },
): boolean {
  return pointInRouteRegion(point, region);
}

/**
 * **Whose soil this is, asked only of the players' own** — the territory detector of design
 * sheet 04, which has no radius because it is not a thing standing on the ground: it *is* the
 * ground. A road is walked sample by sample against it, so the reading is restricted to the
 * countries that can answer rather than to the whole world.
 */
export function hostAmongCountries(point: LonLat, adm0s: ReadonlySet<string>): string {
  return hostAmongAtRoutePoint(point, adm0s) ?? '';
}

/**
 * **Combien de kilomètres de route séparent un point de chacune d'une liste de places**, en une
 * seule fouille. C'est ce que la pose des objectifs neutres demande de chaque quartier général :
 * un millier de régions candidates, et un Dijkstra par région serait mille Dijkstra.
 *
 * **Des kilomètres de route, jamais un vol d'oiseau** : ce que la règle borne est le trajet qu'une
 * colonne fera, et la grille est le seul endroit qui le sache.
 *
 * Le mode dit ce que le monde relie : `'land'` un chemin qu'on marche, `'combined'` un chemin
 * qu'on fait, l'eau comprise. Une place que le mode ne relie pas n'apparaît pas dans la réponse :
 * l'absence dit « aucune route », et la règle place ailleurs (`planObjectives`).
 */
export function routeKmFrom(
  from: LonLat,
  places: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
  mode: 'land' | 'combined',
  /** L'horizon de la fouille. Il n'est pas une commodité : borné à mille kilomètres le champ
   *  coûte vingt millisecondes, sans borne cent vingt, et la pose entière tient dans la seconde
   *  d'une mutation parce que son appelant sait toujours jusqu'où il a besoin de voir. */
  maxKm?: number,
): ReadonlyMap<string, number> {
  grid ??= decodeGrid(gridAsset, projection);
  const field = routeDistanceKmField(grid, from, mode, maxKm);
  const measured = new Map<string, number>();
  for (const place of places) {
    const kilometres = routeDistanceKmAt(grid, field, place.point, mode);
    if (kilometres !== null) measured.set(place.id, kilometres);
  }
  return measured;
}
