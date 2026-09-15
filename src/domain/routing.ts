import type { LonLat } from './geo';
import type { Medium } from './ids';
import type { ProjectedCountry, World } from './world';

/**
 * Land, naval, air or combined route computation on a grid derived from the projected world
 * (ADR 0012). Pure TS: the server will call this module when a movement is created — if the
 * client computed its own routes, it would also pick its own speeds.
 *
 * The relative costs are **arbitrary**, never simulated, like those of `convex/constants.ts`:
 * the balancing simulation will take them over.
 */
export type RouteMode = 'land' | 'naval' | 'air' | 'combined';
export type { Medium };

export type RouteLeg = { readonly medium: Medium; readonly distanceUnits: number };

export type ComputedRoute = {
  readonly mode: RouteMode;
  /** Polyline in real lon/lat; a segment whose longitude gap exceeds 180° wraps around. */
  readonly points: ReadonlyArray<LonLat>;
  /** In projected units (1 unit ≈ 111 km at the equator), transfers excluded. */
  readonly distanceUnits: number;
  /** In equivalent units: distance weighted by medium + transfers. This is the time. */
  readonly costUnits: number;
  readonly legs: ReadonlyArray<RouteLeg>;
  /**
   * **What a land unit cost this column**, `COST_BY_MEDIUM.land` or `.landMotorized`. It travels
   * with the route because the route was *weighted* with it: the pawn, the segmented scale and
   * the preview all reprice the legs to place themselves, and a reader that assumed the foot
   * price would put the pawn on the wrong leg of a crossing.
   */
  readonly landCost: number;
};

type RouteStep = {
  readonly medium: Medium;
  readonly distanceUnits: number;
  readonly transfer: boolean;
};

export type RouteSearch = {
  readonly route: ComputedRoute;
  readonly rawPoints: ReadonlyArray<LonLat>;
  readonly steps: ReadonlyArray<RouteStep>;
  readonly goalCell: number;
};

/**
 * **What the trip is made of, read off the legs and never off the mode.** `RouteMode` says what
 * the pile was *allowed* to use — a column with a cargo routes `combined` even when the road
 * gets there dry — so a card that printed the mode would tell the player he sails to the next
 * region. The legs are what the Dijkstra actually walked, and they are already computed.
 *
 * Land and sea together is the crossing ADR 0012 wrote; air is a whole route or none, so it
 * never mixes.
 */
export type RouteMedium = Medium | 'combined';

export function routeMedium(legs: ReadonlyArray<RouteLeg>): RouteMedium {
  const media = new Set(legs.map((leg) => leg.medium));
  if (media.has('air')) return 'air';
  if (media.has('land') && media.has('sea')) return 'combined';
  return media.has('sea') ? 'sea' : 'land';
}

/**
 * One projected unit in kilometres, read at the equator. The projection tightens toward the
 * poles, so this is an average and not an exact scale: enough to turn a route cost into a
 * duration for a preview, not enough to bill a movement with.
 */
export const KM_PER_UNIT = 111;

/**
 * **The price of a unit of ground, and of a unit of water.** Arbitrary, never simulated — ADR
 * 0012 says so of the first two, and `landMotorized` joins them on the same footing.
 *
 * `landMotorized` is what a column pays when its infantry rides rather than walks (note « le
 * transport terrestre et l'allure », validated 19/08): **1.15 against 1.6 on foot**, which is
 * faster than a march and still slower than the sea at 1.0 — the maritime motorway stays the
 * motorway, and that ordering is the whole of why the number was picked there.
 *
 * `MINUTES_PER_ROUTE_UNIT` prices a cost unit off `land` and off nothing else: the one measured
 * number of movement is 14 minutes per 1 000 km **on foot** (simulation report), so a motorized
 * column comes out at 1.15/1.6 of it rather than at a second measurement nobody took.
 *
 * @a-mesurer relative prices chosen for their ordering; only the foot pace behind them is measured
 */
export const COST_BY_MEDIUM: Readonly<Record<'land' | 'sea' | 'landMotorized', number>> = {
  land: 1.6,
  landMotorized: 1.15,
  sea: 1.0,
};

/** How a land column moves, as the screen says it. Read off the route rather than off the
 *  pile: the server weighted the route, and it is the one that knows what it charged. */
export type LandPace = 'foot' | 'motorized';

export const landPaceOf = (route: { readonly landCost: number }): LandPace =>
  route.landCost < COST_BY_MEDIUM.land ? 'motorized' : 'foot';
/** Embarking or landing costs the equivalent of 8 sea units — the column/convoy trade-off. */
export const TRANSFER_COST = 8;

const EMPTY = 0;
const LAND = 1;
const SEA = 2;
/**
 * **De l'eau et un gué à la fois.** Une cellule n'a qu'un type, et graver Panama ou Suez en
 * `SEA` remplaçait une bande de terre par de la mer : l'Amérique du Nord se retrouvait coupée
 * de l'Amérique du Sud, l'Afrique de l'Asie, et aucune colonne ne passait plus l'isthme. Un
 * canal se navigue *et* se franchit — ferries et ponts tournants existaient à Panama comme à
 * Suez en 1940 — là où un détroit naturel reste de la mer et rien d'autre.
 */
const CANAL = 3;

/** Ce que la recherche a le droit de fouler, par mode. Un canal est des deux côtés. */
const ALLOWED_BY_MODE: Readonly<Record<'land' | 'naval' | 'combined', ReadonlyArray<number>>> = {
  land: [LAND, CANAL],
  naval: [SEA, CANAL],
  combined: [LAND, SEA, CANAL],
};

const isWaterType = (type: number): boolean => type === SEA || type === CANAL;

/**
 * Straits and canals thinner than the grid, engraved as corridors: without them the
 * raster welds Gibraltar shut, closes the Channel and ignores Suez and Panama — rounding
 * Africa would become mandatory again, whereas in 1940 it is a blockade choice, not geometry.
 *
 * `kind` says what the engraving writes: a strait is sea, a canal is a canal, and that is the
 * whole of the difference — the hulls transit both, the columns cross only the second.
 */
export const SEA_GATES: ReadonlyArray<{
  name: string;
  kind: 'strait' | 'canal';
  passage: ReadonlyArray<LonLat>;
}> = [
  {
    name: 'Pas de Calais',
    kind: 'strait',
    passage: [
      [1.1, 50.6],
      [1.6, 51.0],
    ],
  },
  {
    name: 'Gibraltar',
    kind: 'strait',
    passage: [
      [-5.9, 35.9],
      [-5.2, 36.0],
    ],
  },
  {
    name: 'Øresund',
    kind: 'strait',
    passage: [
      [12.3, 56.1],
      [12.9, 55.5],
      [12.7, 55.0],
    ],
  },
  {
    name: 'Dardanelles and Bosphorus',
    kind: 'strait',
    passage: [
      [26.0, 40.0],
      [26.7, 40.3],
      [27.6, 40.5],
      [28.9, 40.8],
      [29.2, 41.2],
      [29.3, 41.4],
    ],
  },
  {
    name: 'Suez Canal',
    kind: 'canal',
    passage: [
      [32.3, 31.3],
      [32.35, 30.6],
      [32.55, 29.9],
    ],
  },
  {
    name: 'Panama Canal',
    kind: 'canal',
    passage: [
      [-79.9, 9.4],
      [-79.6, 8.9],
    ],
  },
  {
    name: 'Hormuz',
    kind: 'strait',
    passage: [
      [56.2, 26.6],
      [56.6, 26.3],
    ],
  },
  {
    name: 'Malacca',
    kind: 'strait',
    passage: [
      [100.0, 6.2],
      [101.3, 4.4],
      [102.5, 3.0],
      [103.6, 1.5],
      [104.2, 1.2],
    ],
  },
  {
    name: 'Bab-el-Mandeb',
    kind: 'strait',
    passage: [
      [43.3, 12.7],
      [43.5, 12.4],
    ],
  },
];

export type RouteGrid = {
  readonly width: number;
  readonly height: number;
  readonly step: number;
  readonly cells: Uint8Array;
  /** Per row: [first non-empty cell, last], -1 when none — east-west wrapping. */
  readonly edges: Int32Array;
  readonly sphere: World['sphere'];
  readonly outline: World['outline'];
};

export function buildGrid(world: World, step = 0.25): RouteGrid {
  const width = Math.ceil((world.sphere.maxX - world.sphere.minX) / step);
  const height = Math.ceil((world.sphere.maxY - world.sphere.minY) / step);
  const cells = new Uint8Array(width * height);

  const edgesByRow = sphereEdges(world, step, height);
  for (let row = 0; row < height; row++) {
    const [west, east] = edgesByRow[row]!;
    const start = Math.max(0, Math.ceil((west - world.sphere.minX) / step - 0.5));
    const end = Math.min(width - 1, Math.floor((east - world.sphere.minX) / step - 0.5));
    for (let column = start; column <= end; column++) {
      cells[row * width + column] = SEA;
    }
  }

  fillLand(world, step, width, height, cells);

  for (const gate of SEA_GATES) {
    engravePassage(
      gate.passage,
      gate.kind === 'canal' ? CANAL : SEA,
      world,
      step,
      width,
      height,
      cells,
    );
  }

  return {
    width,
    height,
    step,
    cells,
    edges: rowEdges(cells, width, height),
    sphere: world.sphere,
    outline: world.outline,
  };
}

function rowEdges(cells: Uint8Array, width: number, height: number): Int32Array {
  const edges = new Int32Array(height * 2).fill(-1);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const cell = row * width + column;
      if (cells[cell] === EMPTY) continue;
      if (edges[row * 2] === -1) edges[row * 2] = cell;
      edges[row * 2 + 1] = cell;
    }
  }
  return edges;
}

/**
 * **The raster, baked.** Rasterising the country polygons is a few dozen milliseconds warm on a
 * development machine and seconds cold without a JIT — and a Convex query has one second, which
 * `view:playerView` was intermittently losing on the first call of a fresh isolate. Land and sea
 * are flats, so run-length pairs take the 1.33 M cells down to 65 Ko of JSON, and decoding them
 * is a handful of `fill` calls.
 *
 * `buildGrid` stays the reference: the bake is checked against it byte for byte in the verifier,
 * so a changed `SEA_GATES` or a regenerated `world.json` breaks the build rather than lying in
 * production.
 */
export type GridAsset = {
  readonly step: number;
  readonly width: number;
  readonly height: number;
  /** Runs over the cells, in reading order: value, length, value, length… */
  readonly cells: ReadonlyArray<number>;
};

export function encodeGrid(grid: RouteGrid): GridAsset {
  const cells: number[] = [];
  let value = grid.cells[0]!;
  let length = 0;
  for (const cell of grid.cells) {
    if (cell === value) {
      length += 1;
      continue;
    }
    cells.push(value, length);
    value = cell;
    length = 1;
  }
  cells.push(value, length);
  return { step: grid.step, width: grid.width, height: grid.height, cells };
}

/**
 * The sphere and the outline come from the world rather than from the asset: they are already in
 * the bundle for the country containment, and two copies of the same frame could disagree.
 */
export function decodeGrid(asset: GridAsset, world: World): RouteGrid {
  const cells = new Uint8Array(asset.width * asset.height);
  let at = 0;
  for (let run = 0; run < asset.cells.length; run += 2) {
    const value = asset.cells[run]!;
    const length = asset.cells[run + 1]!;
    if (value !== EMPTY) cells.fill(value, at, at + length);
    at += length;
  }
  if (at !== cells.length) {
    throw new Error(`baked grid covers ${at} cells, expected ${cells.length}`);
  }
  return {
    width: asset.width,
    height: asset.height,
    step: asset.step,
    cells,
    edges: rowEdges(cells, asset.width, asset.height),
    sphere: world.sphere,
    outline: world.outline,
  };
}

export function computeRoute(
  grid: RouteGrid,
  from: LonLat,
  to: LonLat,
  mode: RouteMode,
  /**
   * **The pace, as a weight and not as a mode.** The mode says which media Dijkstra may walk;
   * this says what a unit of ground costs the column that walks them. They are two readings of
   * one pile and they stay apart: folding the pace into `RouteMode` would double the union at
   * every new pace (land/combined × foot/motorized) and force every `switch` on the mode to
   * learn which of its arms are land-ish.
   *
   * It weights the **edges**, so it changes the route and not only its duration — a motorized
   * column can prefer a trek the same column on foot would have shipped around.
   */
  landCost: number = COST_BY_MEDIUM.land,
): ComputedRoute | null {
  if (mode === 'air') return airRoute(grid, from, to);

  // Snapping may find a neighboring water cell for a quay, never replace the destination
  // with another shore: the arrival records the point the player actually chose.
  const allowed = ALLOWED_BY_MODE[mode];
  if (mode === 'land' && !allowed.includes(grid.cells[projectOnGrid(grid, to)]!)) return null;
  if (mode === 'naval' && isLandCell(grid, to) && !isCoastCell(grid, to)) return null;

  const start = nearestCell(grid, projectOnGrid(grid, from), allowed);
  const goal = nearestCell(grid, projectOnGrid(grid, to), allowed);
  if (start === null || goal === null) return null;

  const path = dijkstra(grid, start, (cell) => cell === goal, mode, landCost);
  if (path === null) return null;
  return routeSearchOf(grid, path, mode, landCost).route;
}

/** One weighted search toward every admissible cell; the first extracted goal is the cheapest. */
export function computeRouteToAny(
  grid: RouteGrid,
  from: LonLat,
  goalCells: ReadonlySet<number>,
  mode: RouteMode,
  landCost: number = COST_BY_MEDIUM.land,
): RouteSearch | null {
  if (goalCells.size === 0) return null;

  if (mode === 'air') {
    let goal: number | null = null;
    let least = Number.POSITIVE_INFINITY;
    for (const candidate of goalCells) {
      const to = unprojectCell(grid, candidate);
      const distance = airRoute(grid, from, to).distanceUnits;
      if (distance < least || (distance === least && (goal === null || candidate < goal))) {
        goal = candidate;
        least = distance;
      }
    }
    if (goal === null) return null;
    const to = unprojectCell(grid, goal);
    const step = { medium: 'air' as const, distanceUnits: least, transfer: false };
    return {
      route: routeOf('air', [from, to], [step], landCost),
      rawPoints: [from, to],
      steps: [step],
      goalCell: goal,
    };
  }

  const allowed = ALLOWED_BY_MODE[mode];
  const usableGoals = new Set([...goalCells].filter((cell) => allowed.includes(grid.cells[cell]!)));
  if (usableGoals.size === 0) return null;
  const start = nearestCell(grid, projectOnGrid(grid, from), allowed);
  if (start === null) return null;
  const path = dijkstra(grid, start, (cell) => usableGoals.has(cell), mode, landCost);
  return path === null ? null : routeSearchOf(grid, path, mode, landCost);
}

/** Reprices the exact prefix rather than prorating totals detached from their route legs. */
export function truncateRouteSearch(
  grid: RouteGrid,
  search: RouteSearch,
  segmentIndex: number,
  fraction: number,
  point: LonLat,
): ComputedRoute {
  const bounded = Math.max(0, Math.min(1, fraction));
  const steps: RouteStep[] = search.steps.slice(0, segmentIndex);
  const crossing = search.steps[segmentIndex];
  if (crossing !== undefined && bounded > 0) {
    steps.push({
      ...crossing,
      distanceUnits:
        crossing.medium === 'air'
          ? airRoute(grid, search.rawPoints[segmentIndex]!, point).distanceUnits
          : crossing.distanceUnits * bounded,
    });
  }

  const points = search.rawPoints.slice(0, segmentIndex + 1);
  if (points.length === 0) points.push(point);
  else if (bounded === 0) points[points.length - 1] = point;
  else points.push(point);
  return routeOf(search.route.mode, points, steps, search.route.landCost);
}

/** A sub-cell interior point completes a tiny region without pretending its pole is a goal. */
export function extendRouteSearch(
  grid: RouteGrid,
  search: RouteSearch,
  point: LonLat,
): RouteSearch {
  const from = search.rawPoints[search.rawPoints.length - 1]!;
  if (from[0] === point[0] && from[1] === point[1]) return search;
  const medium: Medium =
    search.route.mode === 'air'
      ? 'air'
      : search.route.mode === 'land'
        ? 'land'
        : search.route.mode === 'naval'
          ? 'sea'
          : isLandCell(grid, point)
            ? 'land'
            : 'sea';
  const step: RouteStep = {
    medium,
    distanceUnits:
      medium === 'air'
        ? airRoute(grid, from, point).distanceUnits
        : projectedDistance(grid, from, point),
    transfer: false,
  };
  const rawPoints = [...search.rawPoints, point];
  const steps = [...search.steps, step];
  return {
    route: routeOf(search.route.mode, rawPoints, steps, search.route.landCost),
    rawPoints,
    steps,
    goalCell: search.goalCell,
  };
}

function routeSearchOf(
  grid: RouteGrid,
  path: ReadonlyArray<number>,
  mode: RouteMode,
  landCost: number,
): RouteSearch {
  const rawPoints = path.map((cell) => unprojectCell(grid, cell));
  const steps: RouteStep[] = [];
  const search = mode === 'air' ? 'combined' : mode;
  let carried = carriedInto(grid, path[0]!, search, null);
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]!;
    const cell = path[index]!;
    const from = grid.cells[previous]!;
    const to = grid.cells[cell]!;
    // Le chemin sort de `dijkstra`, qui a déjà refusé les pas sans milieu.
    const medium = stepMedium(search, from, to, carried) ?? carried;
    steps.push({
      medium,
      distanceUnits: distanceBetweenCells(grid, previous, cell),
      transfer: isTransfer(medium, carried, to),
    });
    carried = to === SEA ? 'sea' : to === LAND ? 'land' : medium;
  }
  return {
    route: routeOf(mode, rawPoints, steps, landCost),
    rawPoints,
    steps,
    goalCell: path[path.length - 1]!,
  };
}

function routeOf(
  mode: RouteMode,
  points: ReadonlyArray<LonLat>,
  steps: ReadonlyArray<RouteStep>,
  landCost: number,
): ComputedRoute {
  const legs: RouteLeg[] = [];
  let distance = 0;
  let cost = 0;
  for (const step of steps) {
    distance += step.distanceUnits;
    const multiplier =
      step.medium === 'air' ? 1 : step.medium === 'sea' ? COST_BY_MEDIUM.sea : landCost;
    cost += step.distanceUnits * multiplier + (step.transfer ? TRANSFER_COST : 0);
    const last = legs[legs.length - 1];
    if (last?.medium === step.medium) {
      legs[legs.length - 1] = {
        medium: step.medium,
        distanceUnits: last.distanceUnits + step.distanceUnits,
      };
    } else {
      legs.push({ medium: step.medium, distanceUnits: step.distanceUnits });
    }
  }

  return {
    mode,
    points: simplify(points),
    distanceUnits: distance,
    costUnits: cost,
    legs,
    landCost,
  };
}

type SearchMode = 'land' | 'naval' | 'combined';

/**
 * **Le milieu d'un pas suit ce que la recherche a autorisé, jamais les seules cellules.** Un
 * canal est de l'eau et un gué : le même pas `CANAL → CANAL` est un transit pour un navire et
 * une traversée à pied pour une colonne, et deux types de cellule ne peuvent pas dire laquelle
 * des deux. Une recherche terrestre ne met donc jamais un pied en mer, une navale ne roule
 * jamais, et en combiné c'est le **dernier milieu porté** qui tranche l'ambiguïté du canal.
 *
 * **Un pas qui touche la mer est un pas fait en bateau** (décision 72a, 04/09) : la dernière
 * foulée d'un débarquement part de la mer, et la lire comme une jambe de terre mettait le cargo
 * sur la plage. Elle tient telle quelle — mais on débarque d'une cellule de mer et de nulle part
 * ailleurs : **un canal n'est pas une plage**, d'où le `null`, qui dit que le pas n'existe pas.
 */
function stepMedium(mode: SearchMode, from: number, to: number, carried: Medium): Medium | null {
  if (mode === 'land') return 'land';
  if (mode === 'naval') return 'sea';
  if (to === SEA) return 'sea';
  if (to === CANAL) return carried;
  if (carried === 'land') return 'land';
  return from === SEA ? 'sea' : null;
}

/** Les deux franchissements de la ligne d'eau se paient : l'embarquement et la mise à terre. */
const isTransfer = (medium: Medium, carried: Medium, to: number): boolean =>
  medium !== carried || (medium === 'sea' && to === LAND);

/**
 * **Ce qui porte la colonne en arrivant sur cette cellule.** La terre et la mer répondent
 * seules ; un canal ne répond que par où l'on y est entré, donc on remonte le chemin jusqu'à la
 * première cellule qui ne soit pas un canal. La remontée est bornée par la longueur du canal —
 * quelques cellules — et non par celle du trajet.
 *
 * `previous` absent, c'est le départ : une route combinée est une colonne qui peut embarquer, on
 * la pose donc à terre quand son point de départ tombe dans un canal.
 */
function carriedInto(
  grid: RouteGrid,
  cell: number,
  mode: SearchMode,
  previous: Int32Array | null,
): Medium {
  if (mode === 'land') return 'land';
  if (mode === 'naval') return 'sea';
  let at = cell;
  while (grid.cells[at] === CANAL && previous !== null && previous[at]! !== -1) at = previous[at]!;
  return grid.cells[at] === SEA ? 'sea' : 'land';
}

/**
 * Air ignores the grid: a straight stroke, wrapping through the antimeridian when that is
 * shorter — the same rule as the arc rendering.
 */
function airRoute(grid: RouteGrid, from: LonLat, to: LonLat): ComputedRoute {
  const gap = to[0] - from[0];
  const wraps = Math.abs(gap) > 180;
  let distance: number;
  if (!wraps) {
    distance = projectedDistance(grid, from, to);
  } else {
    const eastward = gap < -180;
    const unwrappedGap = eastward ? gap + 360 : gap - 360;
    const borderLongitude = eastward ? 180 : -180;
    const fraction = (borderLongitude - from[0]) / unwrappedGap;
    const crossingLatitude = from[1] + fraction * (to[1] - from[1]);
    distance =
      projectedDistance(grid, from, [borderLongitude, crossingLatitude]) +
      projectedDistance(grid, [-borderLongitude, crossingLatitude], to);
  }
  return {
    mode: 'air',
    points: [from, to],
    distanceUnits: distance,
    costUnits: distance,
    legs: [{ medium: 'air', distanceUnits: distance }],
    landCost: COST_BY_MEDIUM.land,
  };
}

export const isLandCell = (grid: RouteGrid, lonLat: LonLat): boolean =>
  grid.cells[projectOnGrid(grid, lonLat)] === LAND;

/**
 * **A coast, as the routing knows one** — a land cell touching water, and nothing else. A canal
 * counts as that water: Colón, Balboa, Port-Saïd and Suez are ports, and a hull sails from them
 * on this very grid. It is the only definition that can hold: a port is put up so that a ship leaves from it, and what a
 * ship knows of geography is this grid. A coastline read off another source would say "coastal"
 * where Dijkstra finds no water, and the first cargo formed there would leave by road.
 *
 * Both ends read it — the client magnets its ghost onto it, the server refuses whatever is not
 * on it. One function, so never two answers to one click.
 */
export function isCoastCell(grid: RouteGrid, lonLat: LonLat): boolean {
  const cell = projectOnGrid(grid, lonLat);
  if (grid.cells[cell] !== LAND) return false;
  const around: number[] = [];
  const count = neighbors(grid, cell, around);
  for (let i = 0; i < count; i++) {
    if (isWaterType(grid.cells[around[i]!]!)) return true;
  }
  return false;
}

/**
 * **Every coast cell of a projected box**, which is a region's box and never a region: the grid
 * knows nothing of admin-1 shapes and does not have to learn them for this. The caller is the
 * one that says which of these cells fall inside its polygons; plunder crossings use their own
 * cached contour reader.
 *
 * The projected coordinate travels beside the lon/lat because the magnet compares distances on
 * the board: reprojecting every candidate on every frame would cost the hover.
 */
export function coastCellsIn(
  grid: RouteGrid,
  box: readonly [minX: number, minY: number, maxX: number, maxY: number],
): ReadonlyArray<{ readonly x: number; readonly y: number; readonly lonLat: LonLat }> {
  const [minX, minY, maxX, maxY] = box;
  const firstColumn = Math.max(0, Math.floor((minX - grid.sphere.minX) / grid.step - 0.5));
  const lastColumn = Math.min(grid.width - 1, Math.ceil((maxX - grid.sphere.minX) / grid.step));
  const firstRow = Math.max(0, Math.floor((minY - grid.sphere.minY) / grid.step - 0.5));
  const lastRow = Math.min(grid.height - 1, Math.ceil((maxY - grid.sphere.minY) / grid.step));

  const found: Array<{ x: number; y: number; lonLat: LonLat }> = [];
  const around: number[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      const cell = row * grid.width + column;
      if (grid.cells[cell] !== LAND) continue;
      const count = neighbors(grid, cell, around);
      let touchesSea = false;
      for (let i = 0; i < count && !touchesSea; i++)
        touchesSea = isWaterType(grid.cells[around[i]!]!);
      if (!touchesSea) continue;
      found.push({
        x: grid.sphere.minX + (column + 0.5) * grid.step,
        y: grid.sphere.minY + (row + 0.5) * grid.step,
        lonLat: unprojectCell(grid, cell),
      });
    }
  }
  return found;
}

/**
 * A route without a grid: two points, one medium. Sea control needs it — it is a stroke of
 * influence, not a column on the march, there is nothing for Dijkstra to compute — and test
 * benches use it to compose an arc without loading the world.
 */
export function directRoute(
  from: LonLat,
  to: LonLat,
  medium: Medium,
  distanceUnits = 1,
): ComputedRoute {
  const mode: RouteMode = medium === 'air' ? 'air' : medium === 'sea' ? 'naval' : 'land';
  const cost = medium === 'air' ? distanceUnits : distanceUnits * COST_BY_MEDIUM[medium];
  return {
    mode,
    points: [from, to],
    distanceUnits,
    costUnits: cost,
    legs: [{ medium, distanceUnits }],
    landCost: COST_BY_MEDIUM.land,
  };
}

/**
 * **Which country a point stands in**, straight off the rings the world already carries — as an
 * `adm0_a3`, the code every rule keys on.
 *
 * **Containment, never proximity.** The nearest region's point used to stand in for this, and it
 * answered the wrong country five times out of six along a border: Menton fell to Monaco,
 * Aix-la-Chapelle to Belgium, Saint-Louis to Switzerland. A pole of inaccessibility is not a
 * border, so nothing that keys on a host may be read off a distance to one.
 *
 * **The server does not call it any more** (ADR 0023): it walks every ring of every country, and
 * the rings alone weighed eleven megabytes of isolate heap. The answer is baked per cell into
 * `region-grid.json` — from this very containment, one projection away — and read there. What is
 * left here is the reference the bake is cut from, and the reading the map layer may still want.
 */
export function countryAt(world: World, lonLat: LonLat): string | null {
  return countryAtPlanePoint(world.countries, projectLonLat(world.outline, world.sphere, lonLat));
}

/**
 * **La même containment, sur le plan et sans projeter** — ce dont la cuisson du raster a besoin
 * (`scripts/generate-region-grid.mjs`) : elle interroge des centres de cellule, qui sont déjà des
 * points du plan, et un aller-retour par la lon/lat lui ferait répondre à côté de la question
 * qu'elle pose. L'ordre de la table décide en cas de chevauchement : c'est le **premier** pays
 * qui contient le point, jamais le plus petit — l'inverse de la règle d'enclave des régions.
 */
export const countryAtPlanePoint = (
  countries: ReadonlyArray<ProjectedCountry>,
  point: readonly [x: number, y: number],
): string | null =>
  countries.find((country) => ringsContainPoint(country.rings, point))?.adm0 ?? null;

function ringsContainPoint(
  rings: ProjectedCountry['rings'],
  [x, y]: readonly [x: number, y: number],
): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
      const a = ring[i]!;
      const b = ring[previous]!;
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/* ------------------------------ projection ------------------------------ */

function edgeAtLatitude(
  outline: World['outline'],
  latitude: number,
): { westX: number; eastX: number; y: number } {
  const position = Math.min(outline.length - 1.001, Math.max(0, latitude + 90));
  const index = Math.floor(position);
  const fraction = position - index;
  const a = outline[index] ?? outline[0]!;
  const b = outline[index + 1] ?? a;
  return {
    westX: a[1] + (b[1] - a[1]) * fraction,
    eastX: a[2] + (b[2] - a[2]) * fraction,
    y: a[3] + (b[3] - a[3]) * fraction,
  };
}

export function projectLonLat(
  outline: World['outline'],
  sphere: World['sphere'],
  lonLat: LonLat,
): [number, number] {
  const centerX = (sphere.minX + sphere.maxX) / 2;
  const edge = edgeAtLatitude(outline, lonLat[1]);
  return [centerX + (lonLat[0] / 180) * (edge.eastX - centerX), edge.y];
}

/** Latitude from a projected y: the outline is monotonic in y, a bisection suffices. */
function latitudeAtY(outline: World['outline'], y: number): number {
  let low = 0;
  let high = outline.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (outline[middle]![3] >= y) low = middle;
    else high = middle;
  }
  const a = outline[low]!;
  const b = outline[high]!;
  const fraction = a[3] === b[3] ? 0 : (a[3] - y) / (a[3] - b[3]);
  return a[0] + (b[0] - a[0]) * fraction;
}

function projectOnGrid(grid: RouteGrid, lonLat: LonLat): number {
  const [x, y] = projectLonLat(grid.outline, grid.sphere, lonLat);
  const column = Math.min(
    grid.width - 1,
    Math.max(0, Math.round((x - grid.sphere.minX) / grid.step - 0.5)),
  );
  const row = Math.min(
    grid.height - 1,
    Math.max(0, Math.round((y - grid.sphere.minY) / grid.step - 0.5)),
  );
  return row * grid.width + column;
}

function unprojectCell(grid: RouteGrid, cell: number): LonLat {
  const column = cell % grid.width;
  const row = Math.floor(cell / grid.width);
  const x = grid.sphere.minX + (column + 0.5) * grid.step;
  const y = grid.sphere.minY + (row + 0.5) * grid.step;
  return lonLatAtProjected(grid.outline, grid.sphere, [x, y]);
}

export function lonLatAtProjected(
  outline: World['outline'],
  sphere: World['sphere'],
  point: readonly [x: number, y: number],
): LonLat {
  const latitude = latitudeAtY(outline, point[1]);
  const centerX = (sphere.minX + sphere.maxX) / 2;
  const halfWidth = edgeAtLatitude(outline, latitude).eastX - centerX;
  const longitude = halfWidth === 0 ? 0 : ((point[0] - centerX) / halfWidth) * 180;
  return [Math.max(-180, Math.min(180, longitude)), latitude];
}

function projectedDistance(grid: RouteGrid, a: LonLat, b: LonLat): number {
  const [ax, ay] = projectLonLat(grid.outline, grid.sphere, a);
  const [bx, by] = projectLonLat(grid.outline, grid.sphere, b);
  return Math.hypot(bx - ax, by - ay);
}

/* ------------------------------ construction ----------------------------- */

function sphereEdges(world: World, step: number, height: number): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  const byY = [...world.outline].sort((a, b) => a[3] - b[3]);
  let index = 0;
  for (let row = 0; row < height; row++) {
    const y = world.sphere.minY + (row + 0.5) * step;
    while (index < byY.length - 2 && byY[index + 1]![3] < y) index++;
    const a = byY[index]!;
    const b = byY[index + 1]!;
    const fraction = a[3] === b[3] ? 0 : Math.min(1, Math.max(0, (y - a[3]) / (b[3] - a[3])));
    edges.push([a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction]);
  }
  return edges;
}

/** Even-odd scanline fill: countries are disjoint, global parity suffices. */
function fillLand(
  world: World,
  step: number,
  width: number,
  height: number,
  cells: Uint8Array,
): void {
  const crossingsByRow: number[][] = Array.from({ length: height }, () => []);
  for (const country of world.countries) {
    for (const ring of country.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i]!;
        const [bx, by] = ring[(i + 1) % ring.length]!;
        if (ay === by) continue;
        const rowMin = Math.max(0, Math.ceil((Math.min(ay, by) - world.sphere.minY) / step - 0.5));
        const rowMax = Math.min(
          height - 1,
          Math.floor((Math.max(ay, by) - world.sphere.minY) / step - 0.5),
        );
        for (let row = rowMin; row <= rowMax; row++) {
          const y = world.sphere.minY + (row + 0.5) * step;
          if (y < Math.min(ay, by) || y >= Math.max(ay, by)) continue;
          crossingsByRow[row]!.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      }
    }
  }
  for (let row = 0; row < height; row++) {
    const xs = crossingsByRow[row]!.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const start = Math.max(0, Math.ceil((xs[i]! - world.sphere.minX) / step - 0.5));
      const end = Math.min(width - 1, Math.floor((xs[i + 1]! - world.sphere.minX) / step - 0.5));
      for (let column = start; column <= end; column++) {
        cells[row * width + column] = LAND;
      }
    }
  }
}

function engravePassage(
  passage: ReadonlyArray<LonLat>,
  value: number,
  world: World,
  step: number,
  width: number,
  height: number,
  cells: Uint8Array,
): void {
  for (let i = 0; i < passage.length - 1; i++) {
    const [ax, ay] = projectLonLat(world.outline, world.sphere, passage[i]!);
    const [bx, by] = projectLonLat(world.outline, world.sphere, passage[i + 1]!);
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (step * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const y = ay + ((by - ay) * s) / steps;
      const column = Math.round((x - world.sphere.minX) / step - 0.5);
      const row = Math.round((y - world.sphere.minY) / step - 0.5);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr;
          const c = column + dc;
          if (r >= 0 && c >= 0 && r < height && c < width) cells[r * width + c] = value;
        }
      }
    }
  }
}

/* -------------------------------- traversal ------------------------------- */

function nearestCell(
  grid: RouteGrid,
  origin: number,
  allowed: ReadonlyArray<number>,
  maxRadius = 24,
): number | null {
  const column0 = origin % grid.width;
  const row0 = Math.floor(origin / grid.width);
  for (let radius = 0; radius <= maxRadius; radius++) {
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const row = row0 + dr;
        const column = column0 + dc;
        if (row < 0 || column < 0 || row >= grid.height || column >= grid.width) continue;
        const cell = row * grid.width + column;
        if (!allowed.includes(grid.cells[cell]!)) continue;
        const distance = dr * dr + dc * dc;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = cell;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

/**
 * East-west wrapping is part of adjacency: the first and last valid cells of a row are
 * neighbors — the Pacific is a highway here too, otherwise the graph would contradict the
 * arcs that already wrap on screen.
 */
function neighbors(grid: RouteGrid, cell: number, out: number[]): number {
  const column = cell % grid.width;
  const row = Math.floor(cell / grid.width);
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = column + dc;
      if (r < 0 || c < 0 || r >= grid.height || c >= grid.width) continue;
      const candidate = r * grid.width + c;
      if (grid.cells[candidate] !== EMPTY) out[count++] = candidate;
    }
  }
  const first = grid.edges[row * 2]!;
  const last = grid.edges[row * 2 + 1]!;
  if (first !== last && (cell === first || cell === last)) {
    out[count++] = cell === first ? last : first;
  }
  return count;
}

function distanceBetweenCells(grid: RouteGrid, a: number, b: number): number {
  const columnGap = Math.abs((a % grid.width) - (b % grid.width));
  const rowGap = Math.abs(Math.floor(a / grid.width) - Math.floor(b / grid.width));
  if (columnGap > 1) return grid.step;
  return Math.hypot(columnGap, rowGap) * grid.step;
}

function dijkstra(
  grid: RouteGrid,
  start: number,
  isGoal: (cell: number) => boolean,
  mode: SearchMode,
  landCost: number,
): number[] | null {
  const allowed = ALLOWED_BY_MODE[mode];
  const costs = new Float64Array(grid.cells.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(grid.cells.length).fill(-1);
  const heap = new BinaryHeap();
  costs[start] = 0;
  heap.insert(start, 0);
  const buffer = new Array<number>(9);
  let goal: number | null = null;

  while (heap.size > 0) {
    const { cell, cost } = heap.extractMin();
    if (cost > costs[cell]!) continue;
    if (isGoal(cell)) {
      goal = cell;
      break;
    }

    const count = neighbors(grid, cell, buffer);
    const carried = carriedInto(grid, cell, mode, previous);
    for (let i = 0; i < count; i++) {
      const neighbor = buffer[i]!;
      const type = grid.cells[neighbor]!;
      if (!allowed.includes(type)) continue;
      const medium = stepMedium(mode, grid.cells[cell]!, type, carried);
      if (medium === null) continue;
      /**
       * **On ne marche pas après avoir navigué** (décision 72a, 04/09) : le seul pas mer → terre
       * d'une route est son débarquement, donc son dernier. Sans cette porte, Dijkstra posait la
       * colonne sur la plage la moins chère et lui faisait finir à pied — le cargo roulait, et
       * le débarquement cessait d'être une opération qu'on choisit. La visée l'exige déjà côté
       * règle (`LANDING_NEEDS_A_COAST`) : la grille ne fait que refuser de la contourner.
       */
      if (medium === 'sea' && type === LAND && !isGoal(neighbor)) continue;
      const length = distanceBetweenCells(grid, cell, neighbor);
      const multiplier = medium === 'sea' ? COST_BY_MEDIUM.sea : landCost;
      const transfer = isTransfer(medium, carried, type) ? TRANSFER_COST : 0;
      const candidate = cost + length * multiplier + transfer;
      if (candidate < costs[neighbor]!) {
        costs[neighbor] = candidate;
        previous[neighbor] = cell;
        heap.insert(neighbor, candidate);
      }
    }
  }

  if (goal === null) return null;
  const path: number[] = [];
  for (let cell = goal; cell !== -1; cell = previous[cell]!) path.push(cell);
  return path.reverse();
}

class BinaryHeap {
  private cells: number[] = [];
  private costs: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  insert(cell: number, cost: number): void {
    this.cells.push(cell);
    this.costs.push(cost);
    let index = this.cells.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.costs[parent]! <= this.costs[index]!) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  extractMin(): { cell: number; cost: number } {
    const result = { cell: this.cells[0]!, cost: this.costs[0]! };
    const last = this.cells.length - 1;
    this.swap(0, last);
    this.cells.pop();
    this.costs.pop();
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.costs.length && this.costs[left]! < this.costs[smallest]!) smallest = left;
      if (right < this.costs.length && this.costs[right]! < this.costs[smallest]!) smallest = right;
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
    return result;
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b]!, this.cells[a]!];
    [this.costs[a], this.costs[b]] = [this.costs[b]!, this.costs[a]!];
  }
}

/** Removes collinear points: the polyline keeps the turns, not the raster staircase. */
function simplify(points: ReadonlyArray<LonLat>): ReadonlyArray<LonLat> {
  if (points.length <= 2) return points;
  const kept: LonLat[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = kept[kept.length - 1]!;
    const [bx, by] = points[i]!;
    const [cx, cy] = points[i + 1]!;
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(cross) > 1e-6) kept.push(points[i]!);
  }
  kept.push(points[points.length - 1]!);
  return kept;
}
