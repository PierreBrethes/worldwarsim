import type { LonLat } from './geo';
import type { Medium } from './ids';
import type { World } from './world';

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
 * Straits and canals thinner than the grid, engraved as sea corridors: without them the
 * raster welds Gibraltar shut, closes the Channel and ignores Suez and Panama — rounding
 * Africa would become mandatory again, whereas in 1940 it is a blockade choice, not geometry.
 */
export const SEA_GATES: ReadonlyArray<{ name: string; passage: ReadonlyArray<LonLat> }> = [
  {
    name: 'Pas de Calais',
    passage: [
      [1.1, 50.6],
      [1.6, 51.0],
    ],
  },
  {
    name: 'Gibraltar',
    passage: [
      [-5.9, 35.9],
      [-5.2, 36.0],
    ],
  },
  {
    name: 'Øresund',
    passage: [
      [12.3, 56.1],
      [12.9, 55.5],
      [12.7, 55.0],
    ],
  },
  {
    name: 'Dardanelles and Bosphorus',
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
    passage: [
      [32.3, 31.3],
      [32.35, 30.6],
      [32.55, 29.9],
    ],
  },
  {
    name: 'Panama Canal',
    passage: [
      [-79.9, 9.4],
      [-79.6, 8.9],
    ],
  },
  {
    name: 'Hormuz',
    passage: [
      [56.2, 26.6],
      [56.6, 26.3],
    ],
  },
  {
    name: 'Malacca',
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
    engravePassage(gate.passage, world, step, width, height, cells);
  }

  const edges = new Int32Array(height * 2).fill(-1);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const cell = row * width + column;
      if (cells[cell] === EMPTY) continue;
      if (edges[row * 2] === -1) edges[row * 2] = cell;
      edges[row * 2 + 1] = cell;
    }
  }

  return { width, height, step, cells, edges, sphere: world.sphere, outline: world.outline };
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

  const allowed = mode === 'land' ? [LAND] : mode === 'naval' ? [SEA] : [LAND, SEA];
  const start = nearestCell(grid, projectOnGrid(grid, from), allowed);
  const goal = nearestCell(grid, projectOnGrid(grid, to), allowed);
  if (start === null || goal === null) return null;

  const path = dijkstra(grid, start, goal, allowed, landCost);
  if (path === null) return null;

  const points: LonLat[] = [];
  const legs: RouteLeg[] = [];
  let distance = 0;
  let cost = 0;
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    points.push(unprojectCell(grid, cell));
    if (i === 0) continue;
    const previous = path[i - 1]!;
    const length = distanceBetweenCells(grid, previous, cell);
    const medium: Medium = grid.cells[cell] === SEA ? 'sea' : 'land';
    distance += length;
    cost += length * (medium === 'sea' ? COST_BY_MEDIUM.sea : landCost);
    const last = legs[legs.length - 1];
    if (last?.medium === medium) {
      legs[legs.length - 1] = { medium, distanceUnits: last.distanceUnits + length };
    } else {
      legs.push({ medium, distanceUnits: length });
      if (legs.length > 1) cost += TRANSFER_COST;
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
 * `adm0_a3`, the code every rule keys on. It is the one question a lon/lat cannot answer alone
 * and that several rules need — the rest window of a destination first of all — and the server
 * has no other polygons: `regions.json` never comes near it, and `region-index.json` holds one
 * point per region, which places nothing.
 *
 * **Containment, never proximity.** The nearest region's point used to stand in for this, and it
 * answered the wrong country five times out of six along a border: Menton fell to Monaco,
 * Aix-la-Chapelle to Belgium, Saint-Louis to Switzerland. A pole of inaccessibility is not a
 * border, so nothing that keys on a host may be read off a distance to one.
 *
 * Even–odd ray crossing, on the projected plane rather than in degrees: the rings are stored
 * projected, and converting the point once is cheaper and safer than unprojecting a continent.
 * The open sea answers `null`, which is a real answer here and not a failure.
 *
 * It walks every ring of every country. That is one pass over the same geometry the grid is
 * rasterised from, paid once at a departure and never in a loop — the bounding box that would
 * cut it short is not worth its own bugs until a profile asks for it.
 */
export function countryAt(world: World, lonLat: LonLat): string | null {
  const [x, y] = project(world.outline, world.sphere, lonLat);
  for (const country of world.countries) {
    let inside = false;
    for (const ring of country.rings) {
      for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
        const a = ring[i]!;
        const b = ring[previous]!;
        if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
          inside = !inside;
        }
      }
    }
    if (inside) return country.adm0;
  }
  return null;
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

function project(
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
  const [x, y] = project(grid.outline, grid.sphere, lonLat);
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
  const latitude = latitudeAtY(grid.outline, y);
  const centerX = (grid.sphere.minX + grid.sphere.maxX) / 2;
  const halfWidth = edgeAtLatitude(grid.outline, latitude).eastX - centerX;
  const longitude = halfWidth === 0 ? 0 : ((x - centerX) / halfWidth) * 180;
  return [Math.max(-180, Math.min(180, longitude)), latitude];
}

function projectedDistance(grid: RouteGrid, a: LonLat, b: LonLat): number {
  const [ax, ay] = project(grid.outline, grid.sphere, a);
  const [bx, by] = project(grid.outline, grid.sphere, b);
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
  world: World,
  step: number,
  width: number,
  height: number,
  cells: Uint8Array,
): void {
  for (let i = 0; i < passage.length - 1; i++) {
    const [ax, ay] = project(world.outline, world.sphere, passage[i]!);
    const [bx, by] = project(world.outline, world.sphere, passage[i + 1]!);
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
          if (r >= 0 && c >= 0 && r < height && c < width) cells[r * width + c] = SEA;
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
  goal: number,
  allowed: ReadonlyArray<number>,
  landCost: number,
): number[] | null {
  const costs = new Float64Array(grid.cells.length).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(grid.cells.length).fill(-1);
  const heap = new BinaryHeap();
  costs[start] = 0;
  heap.insert(start, 0);
  const buffer = new Array<number>(9);

  while (heap.size > 0) {
    const { cell, cost } = heap.extractMin();
    if (cost > costs[cell]!) continue;
    if (cell === goal) break;

    const count = neighbors(grid, cell, buffer);
    for (let i = 0; i < count; i++) {
      const neighbor = buffer[i]!;
      const type = grid.cells[neighbor]!;
      if (!allowed.includes(type)) continue;
      const length = distanceBetweenCells(grid, cell, neighbor);
      const multiplier = type === SEA ? COST_BY_MEDIUM.sea : landCost;
      const transfer = grid.cells[cell] !== type ? TRANSFER_COST : 0;
      const candidate = cost + length * multiplier + transfer;
      if (candidate < costs[neighbor]!) {
        costs[neighbor] = candidate;
        previous[neighbor] = cell;
        heap.insert(neighbor, candidate);
      }
    }
  }

  if (!Number.isFinite(costs[goal]!)) return null;
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
