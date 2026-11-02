import { distanceKm, type LonLat } from './geo.ts';
import { hostAt, regionAt, type RegionRaster } from './region-raster.ts';
import {
  groundAt,
  isCoastCell,
  isOpenWaterCell,
  lonLatAtProjected,
  projectLonLat,
  type Ground,
  type RouteGrid,
} from './routing.ts';
import type { Projection } from './world';

/**
 * **La côte de mer ouverte de chaque région** (#221), cuite depuis l'atlas au niveau près
 * (`scripts/generate-coast.mjs`, `public/coast.json`) : ni rive de lac, ni Caspienne, ni couture
 * de l'antiméridien. C'est la seule géométrie de l'atlas que le serveur tienne (ADR 0023, amendée) :
 * un port s'y pose, dans sa propre région, et le fantôme s'y aimante. Une seule lecture pour les
 * deux côtés, donc jamais deux réponses à un clic.
 */
export type CoastAsset = {
  readonly quantum: number;
  readonly ids: ReadonlyArray<string>;
  /** The country of each id, as the region raster's host channel names it. */
  readonly countries: ReadonlyArray<string>;
  /**
   * Little-endian `Int32` in base64: `[region rank, point count, dx, dy, dx, dy…]` per arc, the
   * land on the left of whoever walks it.
   */
  readonly data: string;
  /** **The shores of the lakes and of the holes of the land** (#224), the same layout. */
  readonly lakes: string;
  /** **The regions no cell carries** (#224), the same layout, one closed ring per entry. */
  readonly islands: string;
};

type RegionLines = { readonly box: Float64Array; readonly lines: Float32Array[] };

export type Coast = {
  readonly projection: Projection;
  /** The regions with an open-sea coast: what the sheet calls « côtière ». */
  readonly regions: ReadonlySet<string>;
  readonly coastOf: ReadonlyMap<string, RegionLines>;
  /** The lake shores, land on the left: Cleveland, Lausanne, Baku (#224). */
  readonly lakeOf: ReadonlyMap<string, RegionLines>;
  /** The rings of the 906 regions smaller than a cell: Malta, Singapore, the atolls (#224). */
  readonly islandOf: ReadonlyMap<string, RegionLines>;
  readonly countryOf: ReadonlyMap<string, string>;
};

/** **Un port se pose à 2 km au plus de la côte de sa région** (#221). */
export const COAST_REACH_KM = 2;

export function decodeCoast(asset: CoastAsset, projection: Projection): Coast {
  const coastOf = decodeLines(asset, asset.data);
  return {
    projection,
    regions: new Set(coastOf.keys()),
    coastOf,
    lakeOf: decodeLines(asset, asset.lakes),
    islandOf: decodeLines(asset, asset.islands),
    countryOf: new Map(asset.ids.map((id, rank) => [id, asset.countries[rank]!])),
  };
}

function decodeLines(asset: CoastAsset, data: string): Map<string, RegionLines> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ints = new Int32Array(bytes.buffer);

  const coastOf = new Map<string, RegionLines>();
  for (let at = 0; at < ints.length;) {
    const regionId = asset.ids[ints[at++]!]!;
    const count = ints[at++]!;
    const line = new Float32Array(count * 2);
    let [x, y] = [0, 0];
    for (let k = 0; k < count; k++) {
      x += ints[at++]!;
      y += ints[at++]!;
      line[2 * k] = x * asset.quantum;
      line[2 * k + 1] = y * asset.quantum;
    }
    const region =
      coastOf.get(regionId) ??
      coastOf
        .set(regionId, {
          box: Float64Array.of(Infinity, Infinity, -Infinity, -Infinity),
          lines: [],
        })
        .get(regionId)!;
    region.lines.push(line);
    for (let i = 0; i < line.length; i += 2) {
      region.box[0] = Math.min(region.box[0]!, line[i]!);
      region.box[1] = Math.min(region.box[1]!, line[i + 1]!);
      region.box[2] = Math.max(region.box[2]!, line[i]!);
      region.box[3] = Math.max(region.box[3]!, line[i + 1]!);
    }
  }
  return coastOf;
}

/**
 * **Le point de côte le plus proche, à `withinKm` au plus** : sur la côte de `regionId` quand elle
 * est nommée, sinon sur celle de n'importe quelle région — `null` quand aucune n'est à portée.
 * Les kilomètres sont ceux du terrain, pas de la feuille : à 45° de latitude une unité de la
 * feuille fait 78 km d'est en ouest et 88 du sud au nord, et `KM_PER_UNIT` en comptait 111 dans
 * les deux sens. La métrique est celle du point visé, juste à quelques dizaines de kilomètres.
 */
export function nearestCoast(
  coast: Coast,
  lonLat: LonLat,
  withinKm: number,
  regionId: string | null = null,
): { readonly lonLat: LonLat; readonly regionId: string } | null {
  const { outline, sphere } = coast.projection;
  const [x, y] = projectLonLat(outline, sphere, lonLat);
  const [a, b, c] = squaredKmPerUnit(coast.projection, lonLat, [x, y]);
  const smallest = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const reach = withinKm / Math.sqrt(smallest);
  let best = withinKm * withinKm;
  let found: { x: number; y: number; regionId: string } | null = null;
  for (const id of regionId === null ? coast.regions : [regionId]) {
    const region = coast.coastOf.get(id);
    if (region === undefined) continue;
    const [minX, minY, maxX, maxY] = region.box;
    if (x < minX! - reach || x > maxX! + reach || y < minY! - reach || y > maxY! + reach) continue;
    for (const line of region.lines) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        const [ux, uy] = [x - line[i]!, y - line[i + 1]!];
        const [dx, dy] = [line[i + 2]! - line[i]!, line[i + 3]! - line[i + 1]!];
        if (Math.min(ux, ux - dx) > reach || Math.max(ux, ux - dx) < -reach) continue;
        if (Math.min(uy, uy - dy) > reach || Math.max(uy, uy - dy) < -reach) continue;
        const length = a * dx * dx + 2 * b * dx * dy + c * dy * dy;
        const along = a * ux * dx + b * (ux * dy + uy * dx) + c * uy * dy;
        const t = length === 0 ? 0 : Math.min(1, Math.max(0, along / length));
        const [ex, ey] = [ux - t * dx, uy - t * dy];
        const squared = a * ex * ex + 2 * b * ex * ey + c * ey * ey;
        if (squared <= best) [best, found] = [squared, { x: x - ex, y: y - ey, regionId: id }];
      }
    }
  }
  return found === null
    ? null
    : { lonLat: lonLatAtProjected(outline, sphere, [found.x, found.y]), regionId: found.regionId };
}

/**
 * **Squared kilometres per squared unit of the sheet, around a point**: the quadratic form
 * `a·dx² + 2b·dx·dy + c·dy²`, from the projection's Jacobian there — Natural Earth shears the
 * sheet away from the central meridian, so east is not quite along x.
 */
function squaredKmPerUnit(
  { outline, sphere }: Projection,
  [lon, lat]: LonLat,
  [x, y]: readonly [number, number],
): readonly [number, number, number] {
  const h = 0.01;
  const east = lon > 0 ? -h : h;
  const north = lat > 0 ? -h : h;
  const [xe, ye] = projectLonLat(outline, sphere, [lon + east, lat]);
  const [xn, yn] = projectLonLat(outline, sphere, [lon, lat + north]);
  const [j11, j21, j12, j22] = [
    (xe - x) / east,
    (ye - y) / east,
    (xn - x) / north,
    (yn - y) / north,
  ];
  const det = j11 * j22 - j12 * j21;
  const kmEast = distanceKm([lon, lat], [lon + east, lat]) / h;
  const kmNorth = distanceKm([lon, lat], [lon, lat + north]) / h;
  const [e1, e2] = [(kmEast * j22) / det, (-kmEast * j12) / det];
  const [n1, n2] = [(-kmNorth * j21) / det, (kmNorth * j11) / det];
  return [e1 * e1 + n1 * n1, e1 * e2 + n1 * n2, e2 * e2 + n2 * n2];
}

/** **Ce point est-il sur la côte de mer ouverte de cette région ?** À `COAST_REACH_KM` près. */
export const onRegionCoast = (coast: Coast, lonLat: LonLat, regionId: string): boolean =>
  nearestCoast(coast, lonLat, COAST_REACH_KM, regionId) !== null;

/**
 * **Le sol d'un point, à la précision de l'atlas** (#224) : la seule lecture de la terre, pour le
 * serveur comme pour la visée. La grille de 25 km dit la terre qu'elle porte ; là où elle voit la
 * mer, l'atlas a le dernier mot — une région sans cellule (Malte, un atoll), ou le côté terre de la
 * côte de mer ouverte la plus proche (le centre de Naples, Venise). Elle ne retire jamais de terre
 * à la grille : une troupe posée sur une cellule de terre y reste à terre. `coast` absent (la
 * visée avant `coast.json`), la grille seule.
 */
export function groundOf(grid: RouteGrid, coast: Coast | null, lonLat: LonLat): Ground {
  const ground = groundAt(grid, lonLat);
  if (ground === 'land' || coast === null) return ground;
  const [x, y] = projectLonLat(coast.projection.outline, coast.projection.sphere, lonLat);
  const water = ground === 'sea' ? 'coast' : 'lake';
  return islandAt(coast, x, y) !== null || shoreAt(coast, water, x, y, grid.step)?.land === true
    ? 'land'
    : ground;
}

/**
 * **Un sol où poser un bâtiment** (#224) : la terre de `groundOf`, rives des lacs comprises —
 * la maille noie Cleveland et Lausanne sous le lac Érié et le Léman, la côte des lacs les rend à la
 * terre. Le large d'un lac reste de l'eau, comme la mer. Le fantôme et `spotAt` le lisent tous deux.
 */
export const carriesBuilding = (grid: RouteGrid, coast: Coast | null, lonLat: LonLat): boolean =>
  groundOf(grid, coast, lonLat) === 'land';

/**
 * **La région sous un point, et son pays** (#224) : le polygone d'une région sans cellule d'abord,
 * le raster ensuite, puis, sur une terre que le raster noie, la région de la côte la plus proche.
 * `null` au large.
 */
export function regionOf(
  raster: RegionRaster,
  coast: Coast | null,
  lonLat: LonLat,
): { readonly id: string; readonly country: string } | null {
  const [x, y] = projectLonLat(raster.outline, raster.sphere, lonLat);
  const island = coast === null ? null : islandAt(coast, x, y);
  if (island !== null) return { id: island, country: coast!.countryOf.get(island)! };
  const id = regionAt(raster, lonLat);
  if (id !== null) return { id, country: hostAt(raster, lonLat)! };
  const shore = coast === null ? null : shoreAt(coast, 'coast', x, y, raster.step);
  return shore?.land === true
    ? { id: shore.regionId, country: coast!.countryOf.get(shore.regionId)! }
    : null;
}

/**
 * **Où un trait coupe les rivages** (#283), en parts de sa longueur : côtes de mer ouverte, rives
 * des lacs et îles sans cellule. La grille de 28 km soude Messine à la Calabre ; l'atlas, lui, voit
 * le détroit — deux rivages entre la Calabre et la Sicile, aucun d'un champ de Bourgogne à l'autre.
 */
function shoreCrossings(coast: Coast, from: LonLat, to: LonLat): number[] {
  const { outline, sphere } = coast.projection;
  const [ax, ay] = projectLonLat(outline, sphere, from);
  const [bx, by] = projectLonLat(outline, sphere, to);
  const [ux, uy] = [bx - ax, by - ay];
  const crossings: number[] = [];
  for (const shores of [coast.coastOf, coast.lakeOf, coast.islandOf])
    for (const { box, lines } of shores.values()) {
      if (box[0]! > Math.max(ax, bx) || box[2]! < Math.min(ax, bx)) continue;
      if (box[1]! > Math.max(ay, by) || box[3]! < Math.min(ay, by)) continue;
      for (const line of lines)
        for (let i = 0; i + 3 < line.length; i += 2) {
          const [cx, cy] = [line[i]!, line[i + 1]!];
          const [vx, vy] = [line[i + 2]! - cx, line[i + 3]! - cy];
          const cross = ux * vy - uy * vx;
          if (cross === 0) continue;
          const t = ((cx - ax) * vy - (cy - ay) * vx) / cross;
          const s = ((cx - ax) * uy - (cy - ay) * ux) / cross;
          if (t >= 0 && t <= 1 && s >= 0 && s <= 1) crossings.push(t);
        }
    }
  return crossings;
}

/**
 * **Rejoindre une place sans changer de milieu** (#283) : la place est du côté de son milieu à
 * l'atlas, et le trait n'y coupe aucun rivage. Un seul se tolère, tout près du point, quand l'atlas
 * met le point lui-même de l'autre côté — la grille met Piombino à terre, l'atlas juste au large :
 * ce rivage est le sien. Deux rivages, c'est un détroit traversé (le Bosphore).
 */
export function reachedAshore(
  grid: RouteGrid,
  coast: Coast,
  from: LonLat,
  to: LonLat,
  ashore: boolean,
): boolean {
  if (atlasLandAt(grid, coast, to) === !ashore) return false;
  const crossings = shoreCrossings(coast, from, to);
  if (crossings.length === 0) return true;
  return (
    atlasLandAt(grid, coast, from) === !ashore &&
    crossings.length === 1 &&
    crossings[0]! * distanceKm(from, to) <= COAST_REACH_KM
  );
}

/** De quel côté de l'atlas tombe un point près d'un rivage ; `undefined` loin de tout rivage. */
function atlasLandAt(grid: RouteGrid, coast: Coast, lonLat: LonLat): boolean | undefined {
  const [x, y] = projectLonLat(coast.projection.outline, coast.projection.sphere, lonLat);
  if (islandAt(coast, x, y) !== null) return true;
  return (shoreAt(coast, 'coast', x, y, grid.step) ?? shoreAt(coast, 'lake', x, y, grid.step))
    ?.land;
}

/** **La région d'un point, si l'atlas la sait exactement** : celle d'une région sans cellule. */
export function islandRegionOf(coast: Coast, lonLat: LonLat): string | null {
  const [x, y] = projectLonLat(coast.projection.outline, coast.projection.sphere, lonLat);
  return islandAt(coast, x, y);
}

/**
 * **Une plage où une coque accoste** : une cellule côtière de la grille (`isCoastCell`), ou une
 * terre de l'atlas posée dans l'eau ouverte de la grille — Malte, où la coque mouille sur la
 * cellule même de l'île (#224).
 */
export const isLandingShore = (grid: RouteGrid, coast: Coast | null, lonLat: LonLat): boolean =>
  isCoastCell(grid, lonLat) ||
  (isOpenWaterCell(grid, lonLat) && groundOf(grid, coast, lonLat) === 'land');

/**
 * **Ce qu'un point a autour de lui** (#224), rangé une fois à la première lecture : par case de
 * `BUCKET` unités, les îles dont la boîte touche la case, et les segments de côte (ou de rive de
 * lac) à moins de la portée de la case. Sans lui, chaque lecture parcourait les 1 830 côtes et
 * les 906 îles : 60 à 95 µs en mer, 13 sur la terre, payés quatre fois par troupe dans la vue.
 */
type CaseIndex = { readonly start: Int32Array; readonly refs: Int32Array };
type SegmentIndex = CaseIndex & {
  /** `[ax, ay, bx, by]` per segment, and the region it is the shore of. */
  readonly segments: Float32Array;
  readonly segmentRegion: ReadonlyArray<string>;
};
type IslandIndex = CaseIndex & {
  readonly islands: ReadonlyArray<readonly [string, RegionLines]>;
};

/** Half a unit: a few dozen segments a case on a busy coast. */
const BUCKET = 0.5;
const islandIndexes = new WeakMap<Coast, IslandIndex>();
const segmentIndexes = new WeakMap<Coast, Map<string, SegmentIndex>>();

const gridOf = ({ projection: { sphere } }: Coast) => ({
  columns: Math.ceil((sphere.maxX - sphere.minX) / BUCKET),
  rows: Math.ceil((sphere.maxY - sphere.minY) / BUCKET),
});

/** Counting sort into `start`/`refs`: each item lands in every case its box, grown, covers. */
function bucket(coast: Coast, boxes: Float64Array, grow: number): CaseIndex {
  const { sphere } = coast.projection;
  const { columns, rows } = gridOf(coast);
  const at = (value: number, min: number, count: number) =>
    Math.min(count - 1, Math.max(0, Math.floor((value - min) / BUCKET)));
  const each = (k: number, visit: (cell: number) => void) => {
    const [c0, r0] = [
      at(boxes[4 * k]! - grow, sphere.minX, columns),
      at(boxes[4 * k + 1]! - grow, sphere.minY, rows),
    ];
    const [c1, r1] = [
      at(boxes[4 * k + 2]! + grow, sphere.minX, columns),
      at(boxes[4 * k + 3]! + grow, sphere.minY, rows),
    ];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * columns + c);
  };
  const count = boxes.length / 4;
  const start = new Int32Array(columns * rows + 1);
  for (let k = 0; k < count; k++) each(k, (cell) => start[cell + 1]!++);
  for (let cell = 0; cell < columns * rows; cell++) start[cell + 1]! += start[cell]!;
  const refs = new Int32Array(start[columns * rows]!);
  const fill = start.slice();
  for (let k = 0; k < count; k++) each(k, (cell) => (refs[fill[cell]!++] = k));
  return { start, refs };
}

function islandIndexOf(coast: Coast): IslandIndex {
  const known = islandIndexes.get(coast);
  if (known !== undefined) return known;
  const islands = [...coast.islandOf];
  const boxes = new Float64Array(islands.length * 4);
  islands.forEach(([, { box }], k) => boxes.set(box, 4 * k));
  const index = { ...bucket(coast, boxes, 0), islands };
  islandIndexes.set(coast, index);
  return index;
}

function segmentIndexOf(coast: Coast, water: 'coast' | 'lake', reach: number): SegmentIndex {
  const known = segmentIndexes.get(coast) ?? segmentIndexes.set(coast, new Map()).get(coast)!;
  const key = `${water}|${reach}`;
  const cached = known.get(key);
  if (cached !== undefined) return cached;
  const flat: number[] = [];
  const segmentRegion: string[] = [];
  for (const [id, { lines }] of water === 'coast' ? coast.coastOf : coast.lakeOf)
    for (const line of lines)
      for (let i = 0; i + 3 < line.length; i += 2) {
        flat.push(line[i]!, line[i + 1]!, line[i + 2]!, line[i + 3]!);
        segmentRegion.push(id);
      }
  const segments = Float32Array.from(flat);
  const boxes = new Float64Array(segments.length);
  for (let k = 0; k < segments.length; k += 4) {
    boxes[k] = Math.min(segments[k]!, segments[k + 2]!);
    boxes[k + 1] = Math.min(segments[k + 1]!, segments[k + 3]!);
    boxes[k + 2] = Math.max(segments[k]!, segments[k + 2]!);
    boxes[k + 3] = Math.max(segments[k + 1]!, segments[k + 3]!);
  }
  const index = { ...bucket(coast, boxes, reach), segments, segmentRegion };
  known.set(key, index);
  return index;
}

function caseAt(coast: Coast, x: number, y: number): number | null {
  const { sphere } = coast.projection;
  const { columns, rows } = gridOf(coast);
  const column = Math.floor((x - sphere.minX) / BUCKET);
  const row = Math.floor((y - sphere.minY) / BUCKET);
  return column < 0 || row < 0 || column >= columns || row >= rows ? null : row * columns + column;
}

function islandAt(coast: Coast, x: number, y: number): string | null {
  const at = caseAt(coast, x, y);
  if (at === null) return null;
  const index = islandIndexOf(coast);
  for (let ref = index.start[at]!; ref < index.start[at + 1]!; ref++) {
    const [id, { box, lines }] = index.islands[index.refs[ref]!]!;
    if (x < box[0]! || x > box[2]! || y < box[1]! || y > box[3]!) continue;
    let inside = false;
    for (const ring of lines) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return id;
  }
  return null;
}

/**
 * **De quel côté de la côte la plus proche tombe un point**, à une demi-diagonale de cellule au
 * plus — assez pour qu'un point de terre dans une cellule de mer y trouve son rivage, puisque le
 * centre de sa cellule est au large. Les arcs ont la terre à leur gauche ; sur un sommet partagé,
 * les deux segments qui s'y touchent votent ensemble (la pseudo-normale), sans quoi un cap
 * rentrant se lirait du mauvais côté.
 */
function shoreAt(
  coast: Coast,
  water: 'coast' | 'lake',
  x: number,
  y: number,
  step: number,
): { readonly land: boolean; readonly regionId: string } | null {
  const reach = step * Math.SQRT1_2;
  const at = caseAt(coast, x, y);
  if (at === null) return null;
  const index = segmentIndexOf(coast, water, reach);
  const { segments } = index;
  let best = reach * reach;
  let side = 0;
  let found: string | null = null;
  for (let ref = index.start[at]!; ref < index.start[at + 1]!; ref++) {
    const k = index.refs[ref]!;
    const [ax, ay, bx, by] = [
      segments[4 * k]!,
      segments[4 * k + 1]!,
      segments[4 * k + 2]!,
      segments[4 * k + 3]!,
    ];
    const [dx, dy] = [bx - ax, by - ay];
    const length = dx * dx + dy * dy;
    if (length === 0) continue;
    const t = ((x - ax) * dx + (y - ay) * dy) / length;
    const [nx, ny] = t <= 0 ? [ax, ay] : t >= 1 ? [bx, by] : [ax + t * dx, ay + t * dy];
    const squared = (x - nx) ** 2 + (y - ny) ** 2;
    if (squared > best) continue;
    const across = (dx * (y - ay) - dy * (x - ax)) / Math.sqrt(length);
    if (squared < best || found === null)
      [best, side, found] = [squared, across, index.segmentRegion[k]!];
    else side += across;
  }
  return found === null ? null : { land: side > 0, regionId: found };
}
