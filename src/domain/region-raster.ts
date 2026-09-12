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
  /** **Les régions plus petites qu'une cellule**, par couples `cellule, code` : la cellule qui
   *  contient leur point intérieur. Plusieurs régions ancrent la même — les quarante-cinq
   *  régions maltaises tiennent dans une seule. */
  readonly anchors: ReadonlyArray<number>;
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
  /** **La cellule d'ancrage d'une région sans cellule**, et rien pour les autres : une région
   *  y est, ou elle est dans le canal. Les deux ne se recouvrent jamais, ce qui fait de
   *  `cellsOfRegion` une bascule et non un arbitrage. */
  readonly anchorOfRegion: ReadonlyMap<string, number>;
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
    anchors: [...raster.anchorOfRegion].flatMap(([id, cell]) => [
      cell,
      raster.codeOfRegion.get(id)!,
    ]),
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
    anchorOfRegion: anchorsOf(asset),
    sphere: world.sphere,
    outline: world.outline,
  };
}

function anchorsOf(asset: RegionRasterAsset): ReadonlyMap<string, number> {
  const anchored = new Map<string, number>();
  for (let pair = 0; pair < asset.anchors.length; pair += 2) {
    const id = asset.ids[asset.anchors[pair + 1]! - 1];
    if (id !== undefined) anchored.set(id, asset.anchors[pair]!);
  }
  return anchored;
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
 * **Les cellules d'une région, et la direction région → cellules est totale** (ADR 0023) : celles
 * du canal qui portent son code, ou — pour les neuf cent soixante-et-onze régions plus petites
 * qu'une cellule — **sa cellule d'ancrage**, celle qui contient son point intérieur. Les deux cas
 * s'excluent, c'est une bascule et non un arbitrage : une région est dans le canal ou dans la
 * table d'ancrage, jamais dans les deux.
 *
 * **L'ancrage n'est pas une couverture.** La cellule ancrée appartient au raster à une autre
 * région, ou à personne ; ce qu'elle dit est *par où l'on entre*, pas *ce qui est là*. La
 * direction cellule → région n'en sait rien et n'a pas à en savoir — c'est elle qui décide de
 * l'hôte, de la couleur et du franchissement, et l'ancrage n'y met pas un pied.
 *
 * Le balayage du canal est payé à l'appel, jamais retenu : une table cellules-par-région serait
 * 1,33 M d'entiers sur le tas, c'est-à-dire exactement ce que cette ADR a sorti de l'isolat. Il
 * coûte quelques millisecondes, sur des chemins qui en coûtent déjà des dizaines.
 * `goalCellsOfRegions` est sa forme groupée : un seul balayage pour un jeu de régions, la même
 * bascule au bout.
 */
export function cellsOfRegion(raster: RegionRaster, regionId: string): ReadonlyArray<number> {
  const anchor = raster.anchorOfRegion.get(regionId);
  if (anchor !== undefined) return [anchor];
  const code = raster.codeOfRegion.get(regionId);
  if (code === undefined) return [];
  const cells: number[] = [];
  for (let cell = 0; cell < raster.regions.length; cell += 1) {
    if (raster.regions[cell] === code) cells.push(cell);
  }
  return cells;
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
 *
 * Une région ancrée n'a qu'une cellule, donc elle est **toute** bordure : y arriver est y entrer,
 * ce qui est la seule chose que son point ait jamais voulu dire.
 */
export function isRegionBorderCell(
  raster: RegionRaster,
  lonLat: LonLat,
  regionId: string,
): boolean {
  const cells = new Set(cellsOfRegion(raster, regionId));
  const cell = cellAt(raster, lonLat);
  if (!cells.has(cell)) return false;
  const column = cell % raster.width;
  const row = Math.floor(cell / raster.width);
  for (const [dx, dy] of NEIGHBOURS) {
    const next = row + dy;
    if (next < 0 || next >= raster.height) return true;
    const across = (column + dx + raster.width) % raster.width;
    if (!cells.has(next * raster.width + across)) return true;
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
  const cells = new Set(cellsOfRegion(raster, regionId));
  if (cells.size === 0 || path.length < 2) return null;
  const inside = (point: LonLat): boolean => cells.has(cellAt(raster, point));

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
 * Un but de route : une région à atteindre, et — pour une région ancrée seulement — le **point**
 * jusqu'où la route doit être prolongée, parce que la cellule d'arrivée n'est pas elle.
 */
export type RegionGoal = { readonly regionId: string; readonly point?: LonLat };

/**
 * **Les cellules des régions visées**, lues à même le canal : un balayage de 1,33 M d'entiers
 * courts, quelques millisecondes, contre une rasterisation de contours par appel. C'est la forme
 * groupée de `cellsOfRegion` — même bascule, un seul balayage pour tout un jeu de régions.
 *
 * **Une cellule porte une liste de buts, et c'est la correction du 12/09.** Elle en portait un
 * seul, départagé au plus petit identifiant, et ce départage perdait des destinations dans les
 * deux sens : les quarante-cinq régions maltaises ancrées sur la même cellule n'en laissaient
 * qu'une atteignable, et un ancrage pouvait **écraser un but du raster** — cinquante-huit régions
 * qui n'ont qu'une seule cellule, Westminster comprise, se retrouvaient sans aucun but, donc sans
 * destination pour un retour chargé. Sur les 4 589 régions, six cent quarante-six n'en avaient
 * plus. Un ancrage **s'ajoute**, il ne remplace jamais : le raster passe devant sur sa propre
 * cellule, et l'appelant lit la liste.
 *
 * L'ordre est stable — le but du raster d'abord, les ancrages ensuite par identifiant croissant —
 * parce que l'appelant retient le premier qu'il peut suivre et qu'une route ne doit pas changer
 * d'une exécution à l'autre.
 */
export function goalCellsOfRegions(
  raster: RegionRaster,
  regions: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
): ReadonlyMap<number, ReadonlyArray<RegionGoal>> {
  const wanted = new Map<number, string>();
  for (const region of regions) {
    const code = raster.codeOfRegion.get(region.id);
    if (code !== undefined) wanted.set(code, region.id);
  }
  const goals = new Map<number, RegionGoal[]>();
  const represented = new Set<string>();
  if (wanted.size > 0) {
    for (let cell = 0; cell < raster.regions.length; cell += 1) {
      const regionId = wanted.get(raster.regions[cell]!);
      if (regionId === undefined) continue;
      goals.set(cell, [{ regionId }]);
      represented.add(regionId);
    }
  }

  for (const region of [...regions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (represented.has(region.id)) continue;
    const cell = raster.anchorOfRegion.get(region.id);
    if (cell === undefined) continue;
    const at = goals.get(cell);
    if (at === undefined) goals.set(cell, [{ regionId: region.id, point: region.point }]);
    else at.push({ regionId: region.id, point: region.point });
  }
  return goals;
}
