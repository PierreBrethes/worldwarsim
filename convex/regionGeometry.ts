import type { LonLat } from '../src/domain/geo';
import { crossesAntimeridian, shortestLongitudeGap } from '../src/domain/geo';
import {
  firstEntryInRegion,
  pointOnRegionBoundary,
  prepareRegionOutlines,
  regionAtPlanePoint,
  type PlanePoint,
  type PreparedRegionOutline,
  type RegionOutline,
} from '../src/domain/region-crossing';
import { lonLatAtProjected, projectLonLat, type RouteGrid } from '../src/domain/routing';
import type { World } from '../src/domain/world';
import regionsAsset from '../public/regions.json';
import worldAsset from '../public/world.json';

const WIDTH = 400;

type RegionAsset = {
  readonly id: string;
  readonly p: ReadonlyArray<ReadonlyArray<PlanePoint>>;
};

const BUCKET_SIZE = 1;
const BUCKET_COLUMNS = Math.ceil(WIDTH / BUCKET_SIZE);

type RegionIndex = {
  readonly world: World;
  readonly outlines: ReadonlyArray<PreparedRegionOutline>;
  readonly outlineById: ReadonlyMap<string, PreparedRegionOutline>;
  readonly buckets: ReadonlyMap<number, ReadonlyArray<PreparedRegionOutline>>;
};

const isProjectionFrame = (ring: ReadonlyArray<PlanePoint>): boolean => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return maxX - minX > WIDTH * 0.9 && maxY - minY > worldAsset.meta.sphere.maxY * 0.9;
};

/**
 * **Rien de tout ceci ne se fait à l'import** : le déploiement charge chaque module dans son
 * isolat pour y découvrir les fonctions, avec quatre secondes pour l'ensemble, et une préparation
 * de 4 589 contours qui coûte 41 ms à chaud en coûte plusieurs à froid, sans JIT. C'est le modèle
 * de la grille de `routes.ts` : la plupart des mutations d'une saison ne demandent jamais un
 * contour de région, elles ne doivent pas le payer.
 */
function buildIndex(): RegionIndex {
  const outlines = prepareRegionOutlines(
    (regionsAsset.regions as unknown as ReadonlyArray<RegionAsset>).map(
      (region): RegionOutline => ({
        id: region.id,
        /** Natural Earth occasionally projects a degenerate islet as the whole frame. */
        rings: region.p.filter((ring) => !isProjectionFrame(ring)),
      }),
    ),
  );

  const buckets = new Map<number, Array<PreparedRegionOutline>>();
  for (const outline of outlines) {
    const firstColumn = Math.max(0, Math.floor(outline.box[0] / BUCKET_SIZE));
    const lastColumn = Math.min(BUCKET_COLUMNS - 1, Math.floor(outline.box[2] / BUCKET_SIZE));
    const firstRow = Math.max(0, Math.floor(outline.box[1] / BUCKET_SIZE));
    const lastRow = Math.floor(outline.box[3] / BUCKET_SIZE);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const key = row * BUCKET_COLUMNS + column;
        const candidates = buckets.get(key) ?? [];
        candidates.push(outline);
        buckets.set(key, candidates);
      }
    }
  }

  return {
    world: {
      sphere: worldAsset.meta.sphere,
      outline: worldAsset.meta.outline,
      countries: [],
    } as unknown as World,
    outlines,
    outlineById: new Map(outlines.map((outline) => [outline.id, outline])),
    buckets,
  };
}

/** Prepared once per isolate, on the first crossing rather than at import. */
let index: RegionIndex | null = null;
const indexOf = (): RegionIndex => (index ??= buildIndex());

function regionAtProjected(point: PlanePoint): string | null {
  const x = ((point[0] % WIDTH) + WIDTH) % WIDTH;
  return regionAtPlanePoint(outlinesAtProjected([x, point[1]]), [x, point[1]], WIDTH);
}

function outlinesAtProjected(point: PlanePoint): ReadonlyArray<PreparedRegionOutline> {
  const x = ((point[0] % WIDTH) + WIDTH) % WIDTH;
  const column = Math.min(BUCKET_COLUMNS - 1, Math.max(0, Math.floor(x / BUCKET_SIZE)));
  const row = Math.floor(point[1] / BUCKET_SIZE);
  return indexOf().buckets.get(row * BUCKET_COLUMNS + column) ?? [];
}

function crossingsAt(outline: PreparedRegionOutline, y: number): number[] {
  const crossings: number[] = [];
  for (const ring of outline.rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const from = ring[previous]!;
      const to = ring[index]!;
      if (from[1] > y === to[1] > y) continue;
      crossings.push(from[0] + ((y - from[1]) / (to[1] - from[1])) * (to[0] - from[0]));
    }
  }
  return crossings.sort((left, right) => left - right);
}

function interiorPointOf(outline: PreparedRegionOutline): PlanePoint | null {
  const ys = [...new Set(outline.rings.flatMap((ring) => ring.map((point) => point[1])))].sort(
    (left, right) => left - right,
  );
  let best: { point: PlanePoint; width: number } | null = null;
  for (let index = 1; index < ys.length; index += 1) {
    const y = (ys[index - 1]! + ys[index]!) / 2;
    const crossings = crossingsAt(outline, y);
    for (let interval = 0; interval + 1 < crossings.length; interval += 2) {
      const width = crossings[interval + 1]! - crossings[interval]!;
      if (width > 0 && (best === null || width > best.width)) {
        best = { point: [(crossings[interval]! + crossings[interval + 1]!) / 2, y], width };
      }
    }
  }
  return best?.point ?? null;
}

/** Candidate goals are raster cells actually inside the requested contours, never region poles. */
export function goalCellsForRegions(
  regions: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
  grid: RouteGrid,
): ReadonlyMap<number, { readonly regionId: string; readonly point?: LonLat }> {
  const { world, outlineById } = indexOf();
  const regionIds = new Set(regions.map((region) => region.id));
  const goals = new Map<number, { regionId: string; point?: LonLat }>();
  const targets = regions
    .map((region) => outlineById.get(region.id))
    .filter((outline): outline is PreparedRegionOutline => outline !== undefined)
    .sort((left, right) => right.area - left.area || left.id.localeCompare(right.id));
  for (const outline of targets) {
    const firstRow = Math.max(0, Math.floor((outline.box[1] - grid.sphere.minY) / grid.step - 0.5));
    const lastRow = Math.min(
      grid.height - 1,
      Math.ceil((outline.box[3] - grid.sphere.minY) / grid.step - 0.5),
    );
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = grid.sphere.minY + (row + 0.5) * grid.step;
      const crossings = crossingsAt(outline, y);
      for (let interval = 0; interval + 1 < crossings.length; interval += 2) {
        const firstColumn = Math.max(
          0,
          Math.ceil((crossings[interval]! - grid.sphere.minX) / grid.step - 0.5),
        );
        const lastColumn = Math.min(
          grid.width - 1,
          Math.floor((crossings[interval + 1]! - grid.sphere.minX) / grid.step - 0.5),
        );
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const cell = row * grid.width + column;
          goals.set(cell, { regionId: outline.id });
        }
      }
    }
  }

  /** A foreign enclave carves its cells back out; target regions already overwrite by area. */
  for (const [cell, goal] of goals) {
    const regionId = goal.regionId;
    const target = outlineById.get(regionId)!;
    const column = cell % grid.width;
    const row = Math.floor(cell / grid.width);
    const point: PlanePoint = [
      grid.sphere.minX + (column + 0.5) * grid.step,
      grid.sphere.minY + (row + 0.5) * grid.step,
    ];
    const blocker = regionAtPlanePoint(
      outlinesAtProjected(point).filter(
        (candidate) => !regionIds.has(candidate.id) && candidate.area < target.area,
      ),
      point,
      WIDTH,
    );
    if (blocker !== null) goals.delete(cell);
  }

  const represented = new Set([...goals.values()].map((goal) => goal.regionId));
  for (const region of regions) {
    if (represented.has(region.id)) continue;
    const outline = outlineById.get(region.id);
    const interior = outline === undefined ? null : interiorPointOf(outline);
    if (interior === null) continue;
    const [x, y] = interior;
    const point = lonLatAtProjected(world.outline, world.sphere, interior);
    const column = Math.min(
      grid.width - 1,
      Math.max(0, Math.round((x - grid.sphere.minX) / grid.step - 0.5)),
    );
    const row = Math.min(
      grid.height - 1,
      Math.max(0, Math.round((y - grid.sphere.minY) / grid.step - 0.5)),
    );
    const cell = row * grid.width + column;
    const existing = goals.get(cell);
    if (existing === undefined || region.id < existing.regionId) {
      goals.set(cell, { regionId: region.id, point });
    }
  }
  return goals;
}

export function regionAtRoutePoint(point: LonLat): string | null {
  const { world } = indexOf();
  return regionAtProjected(projectLonLat(world.outline, world.sphere, point));
}

export function isRouteEntryPoint(point: LonLat, regionId: string): boolean {
  const { world, outlines } = indexOf();
  return pointOnRegionBoundary(
    outlines,
    regionId,
    projectLonLat(world.outline, world.sphere, point),
    WIDTH,
  );
}

export function firstRouteEntryInRegion(
  points: ReadonlyArray<LonLat>,
  regionId: string,
): { readonly point: LonLat; readonly segmentIndex: number; readonly fraction: number } | null {
  const { world, outlines } = indexOf();
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const from = points[segmentIndex]!;
    const to = points[segmentIndex + 1]!;
    const pieces = splitAtAntimeridian(from, to);
    for (const piece of pieces) {
      const projected = piece.points.map((point) =>
        projectLonLat(world.outline, world.sphere, point),
      );
      const entry = firstEntryInRegion(projected, regionId, outlines, WIDTH);
      if (entry === null) continue;
      return {
        point: lonLatAtProjected(world.outline, world.sphere, entry.point),
        segmentIndex,
        fraction: piece.start + (piece.end - piece.start) * entry.fraction,
      };
    }
  }
  return null;
}

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
