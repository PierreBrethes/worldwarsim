import type { LonLat } from './geo';
import { crossesAntimeridian, shortestLongitudeGap } from './geo';
import type { PlanePoint } from './region-crossing';
import { projectLonLat } from './routing';
import type { World } from './world';

/**
 * **La géographie du serveur, à la maille de la grille de routage.** Les contours admin-1 et les
 * polygones de pays entraient dans le bundle Convex par `import` : 22,6 Mio de tas pour
 * `regions.json`, 11,5 pour `world.json`, payés par **tout** module qui touche à une règle de
 * carte, et retenus tant que l'isolat vit. C'est ce que la production recyclait en boucle.
 *
 * Ici la géométrie est cuite hors ligne, une fois, aux cellules mêmes que Dijkstra parcourt :
 * chaque cellule porte la région qui la contient et le pays qui l'héberge. Ce que le raster perd,
 * c'est la frontière exacte au point flottant ; ce qu'il gagne, c'est un asset décodé en tampons
 * hors tas. **La cellule devient le modèle** — un point est dans la région de sa cellule, et deux
 * points d'une même cellule ne peuvent plus être de deux côtés d'une frontière (ADR 0023).
 *
 * Les deux canaux sont cuits avec les fonctions polygonales elles-mêmes — `regionAtPlanePoint`
 * pour la région, `countryAtPlanePoint` pour l'hôte — de sorte que la bascule ne change aucune
 * règle : à la demi-cellule près, le raster répond ce que le polygone répondait.
 */
export type RegionRasterAsset = {
  readonly step: number;
  readonly width: number;
  readonly height: number;
  /** Les identifiants de région, dans l'ordre de la cuisson : le code d'une cellule est le rang
   *  dans cette table, décalé de un — zéro est « aucune région ». */
  readonly ids: ReadonlyArray<string>;
  /** Les `adm0_a3`, même convention : zéro est la haute mer, et non un pays sans nom. */
  readonly hosts: ReadonlyArray<string>;
  /** Plages sur les cellules, en ordre de lecture : valeur, longueur, valeur, longueur… */
  readonly regionRuns: ReadonlyArray<number>;
  readonly hostRuns: ReadonlyArray<number>;
};

export type RegionRaster = {
  readonly width: number;
  readonly height: number;
  readonly step: number;
  readonly ids: ReadonlyArray<string>;
  readonly hosts: ReadonlyArray<string>;
  /** Un code par cellule, hors tas — c'est tout l'objet de la cuisson. */
  readonly regions: Uint16Array;
  readonly countries: Uint16Array;
  readonly codeOfRegion: ReadonlyMap<string, number>;
  readonly sphere: World['sphere'];
  readonly outline: World['outline'];
};

/** Les plages, comme la grille de routage : la carte est faite d'aplats, et 1,33 M de cellules
 *  se disent en quelques dizaines de milliers de couples. */
export function encodeRegionRaster(raster: RegionRaster): RegionRasterAsset {
  return {
    step: raster.step,
    width: raster.width,
    height: raster.height,
    ids: raster.ids,
    hosts: raster.hosts,
    regionRuns: runsOf(raster.regions),
    hostRuns: runsOf(raster.countries),
  };
}

function runsOf(cells: Uint16Array): number[] {
  const runs: number[] = [];
  let value = cells[0]!;
  let length = 0;
  for (const cell of cells) {
    if (cell === value) {
      length += 1;
      continue;
    }
    runs.push(value, length);
    value = cell;
    length = 1;
  }
  runs.push(value, length);
  return runs;
}

/**
 * La sphère et l'outline viennent de la projection plutôt que de l'asset, comme pour la grille :
 * ils sont déjà dans le bundle pour projeter un point, et deux copies du même cadre pourraient
 * diverger.
 */
export function decodeRegionRaster(asset: RegionRasterAsset, world: World): RegionRaster {
  const regions = fill(asset.regionRuns, asset.width * asset.height);
  const countries = fill(asset.hostRuns, asset.width * asset.height);
  return {
    width: asset.width,
    height: asset.height,
    step: asset.step,
    ids: asset.ids,
    hosts: asset.hosts,
    regions,
    countries,
    codeOfRegion: new Map(asset.ids.map((id, rank) => [id, rank + 1])),
    sphere: world.sphere,
    outline: world.outline,
  };
}

function fill(runs: ReadonlyArray<number>, cells: number): Uint16Array {
  const decoded = new Uint16Array(cells);
  let at = 0;
  for (let run = 0; run < runs.length; run += 2) {
    const value = runs[run]!;
    const length = runs[run + 1]!;
    if (value !== 0) decoded.fill(value, at, at + length);
    at += length;
  }
  if (at !== cells) throw new Error(`baked region raster covers ${at} cells, expected ${cells}`);
  return decoded;
}

/* ------------------------------ lectures ------------------------------ */

export function cellAtPlanePoint(raster: RegionRaster, point: PlanePoint): number {
  const span = raster.sphere.maxX - raster.sphere.minX;
  const x = raster.sphere.minX + ((((point[0] - raster.sphere.minX) % span) + span) % span);
  const column = Math.min(
    raster.width - 1,
    Math.max(0, Math.round((x - raster.sphere.minX) / raster.step - 0.5)),
  );
  const row = Math.min(
    raster.height - 1,
    Math.max(0, Math.round((point[1] - raster.sphere.minY) / raster.step - 0.5)),
  );
  return row * raster.width + column;
}

export const cellAt = (raster: RegionRaster, lonLat: LonLat): number =>
  cellAtPlanePoint(raster, projectLonLat(raster.outline, raster.sphere, lonLat));

export const regionAtCell = (raster: RegionRaster, cell: number): string | null =>
  raster.ids[raster.regions[cell]! - 1] ?? null;

export const regionAt = (raster: RegionRaster, lonLat: LonLat): string | null =>
  regionAtCell(raster, cellAt(raster, lonLat));

export const hostAt = (raster: RegionRaster, lonLat: LonLat): string | null =>
  raster.hosts[raster.countries[cellAt(raster, lonLat)]! - 1] ?? null;

export function hostAmong(
  raster: RegionRaster,
  lonLat: LonLat,
  adm0s: ReadonlySet<string>,
): string | null {
  const host = hostAt(raster, lonLat);
  return host !== null && adm0s.has(host) ? host : null;
}

/**
 * **Une cellule de bordure de la région**, ce que le polygone appelait « le point est sur le
 * contour ». Le raster n'a pas de contour : il a des cellules qui touchent autre chose. C'est le
 * contrôle du point d'entrée gravé d'un retour chargé (`plunder.ts`), et il accepte exactement ce
 * que `firstRegionEntry` produit — la première cellule de la région rencontrée sur la route.
 *
 * **Les huit voisines, et pas les quatre** : deux échantillons consécutifs sont distants d'une
 * demi-cellule, donc la cellule d'où l'on vient est au plus en diagonale. À quatre voisines, une
 * entrée exactement diagonale se ferait refuser une livraison légitime.
 */
export function isRegionBorderCell(
  raster: RegionRaster,
  lonLat: LonLat,
  regionId: string,
): boolean {
  const cell = cellAt(raster, lonLat);
  const code = raster.codeOfRegion.get(regionId);
  if (code === undefined || raster.regions[cell] !== code) return false;
  const column = cell % raster.width;
  const row = Math.floor(cell / raster.width);
  for (const [dx, dy] of NEIGHBOURS) {
    const next = row + dy;
    if (next < 0 || next >= raster.height) return true;
    const across = (column + dx + raster.width) % raster.width;
    if (raster.regions[next * raster.width + across] !== code) return true;
  }
  return false;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

export type RegionEntry = {
  readonly point: LonLat;
  readonly segmentIndex: number;
  readonly fraction: number;
};

/**
 * **Le premier franchissement, exact à la cellule.** La route est parcourue à la demi-cellule ;
 * au premier échantillon qui tombe dans la région, une dichotomie resserre le passage et rend le
 * **côté intérieur** de l'intervalle — le point livré est donc dans la région, toujours, ce que
 * `isRegionBorderCell` revérifie à la livraison.
 *
 * L'antiméridien est coupé comme il l'était : une route qui saute de +180 à −180 n'a pas traversé
 * le Pacifique, et interpoler sans le dire y aurait fait entrer la colonne par la Chine.
 */
export function firstRegionEntry(
  raster: RegionRaster,
  path: ReadonlyArray<LonLat>,
  regionId: string,
): RegionEntry | null {
  const code = raster.codeOfRegion.get(regionId);
  if (code === undefined || path.length < 2) return null;
  const inside = (point: LonLat): boolean => raster.regions[cellAt(raster, point)] === code;

  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    for (const piece of splitAtAntimeridian(path[segmentIndex]!, path[segmentIndex + 1]!)) {
      const [from, to] = piece.points;
      const samples = Math.max(2, sampleCount(raster, from, to));
      let previous = 0;
      for (let sample = 0; sample <= samples; sample += 1) {
        const at = sample / samples;
        if (!inside(between(from, to, at))) {
          previous = at;
          continue;
        }
        const crossing = sample === 0 ? 0 : narrow(from, to, previous, at, inside);
        return {
          point: between(from, to, crossing),
          segmentIndex,
          fraction: piece.start + (piece.end - piece.start) * crossing,
        };
      }
    }
  }
  return null;
}

/** Deux échantillons par cellule traversée : en dessous, une pointe de région d'une cellule de
 *  large passe entre deux mesures. */
function sampleCount(raster: RegionRaster, from: LonLat, to: LonLat): number {
  const [ax, ay] = projectLonLat(raster.outline, raster.sphere, from);
  const [bx, by] = projectLonLat(raster.outline, raster.sphere, to);
  return Math.ceil((Math.hypot(bx - ax, by - ay) / raster.step) * 2);
}

/** Vingt bissections sur un intervalle d'une demi-cellule : le passage est connu bien en deçà du
 *  flottant, et le côté rendu est celui qui est **dedans**. */
function narrow(
  from: LonLat,
  to: LonLat,
  outside: number,
  inside: number,
  isInside: (point: LonLat) => boolean,
): number {
  let low = outside;
  let high = inside;
  for (let pass = 0; pass < 20; pass += 1) {
    const middle = (low + high) / 2;
    if (isInside(between(from, to, middle))) high = middle;
    else low = middle;
  }
  return high;
}

const between = (from: LonLat, to: LonLat, fraction: number): LonLat => [
  from[0] + (to[0] - from[0]) * fraction,
  from[1] + (to[1] - from[1]) * fraction,
];

type SegmentPiece = {
  readonly points: readonly [LonLat, LonLat];
  readonly start: number;
  readonly end: number;
};

function splitAtAntimeridian(from: LonLat, to: LonLat): ReadonlyArray<SegmentPiece> {
  if (!crossesAntimeridian(from, to)) return [{ points: [from, to], start: 0, end: 1 }];
  const gap = shortestLongitudeGap(from[0], to[0]);
  const border = gap > 0 ? 180 : -180;
  const fraction = (border - from[0]) / gap;
  const latitude = from[1] + (to[1] - from[1]) * fraction;
  return [
    { points: [from, [border, latitude]], start: 0, end: fraction },
    { points: [[-border, latitude], to], start: fraction, end: 1 },
  ];
}

/**
 * **Les cellules des régions visées**, lues à même le canal : un balayage de 1,33 M d'entiers
 * courts, quelques millisecondes, contre une rasterisation de contours par appel. Une région dont
 * aucune cellule ne porte le code — plus petite qu'une cellule, ce qui arrive à Monaco comme aux
 * quartiers d'une capitale — garde son point pour cible, et c'est le seul cas où la route est
 * prolongée jusqu'à un point qui n'est pas un centre de cellule.
 */
export function goalCellsOfRegions(
  raster: RegionRaster,
  regions: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
): ReadonlyMap<number, { readonly regionId: string; readonly point?: LonLat }> {
  const wanted = new Map<number, string>();
  for (const region of regions) {
    const code = raster.codeOfRegion.get(region.id);
    if (code !== undefined) wanted.set(code, region.id);
  }
  const goals = new Map<number, { regionId: string; point?: LonLat }>();
  if (wanted.size > 0) {
    for (let cell = 0; cell < raster.regions.length; cell += 1) {
      const regionId = wanted.get(raster.regions[cell]!);
      if (regionId !== undefined) goals.set(cell, { regionId });
    }
  }

  const represented = new Set([...goals.values()].map((goal) => goal.regionId));
  for (const region of regions) {
    if (represented.has(region.id)) continue;
    const cell = cellAt(raster, region.point);
    const existing = goals.get(cell);
    if (existing === undefined || region.id < existing.regionId) {
      goals.set(cell, { regionId: region.id, point: region.point });
    }
  }
  return goals;
}
