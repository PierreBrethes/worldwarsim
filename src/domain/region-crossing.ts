export type PlanePoint = readonly [x: number, y: number];

export type RegionOutline = {
  readonly id: string;
  readonly rings: ReadonlyArray<ReadonlyArray<PlanePoint>>;
};

export type PlaneBox = readonly [minX: number, minY: number, maxX: number, maxY: number];

export type PreparedRegionOutline = RegionOutline & {
  readonly box: PlaneBox;
  readonly area: number;
};

export type RegionEntry = {
  readonly point: PlanePoint;
  readonly segmentIndex: number;
  readonly fraction: number;
};

const TOLERANCE = 1e-9;

export function prepareRegionOutlines(
  outlines: ReadonlyArray<RegionOutline>,
): ReadonlyArray<PreparedRegionOutline> {
  return outlines.map((outline) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let area = 0;
    for (const ring of outline.rings) {
      area += Math.abs(twiceArea(ring)) / 2;
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return { ...outline, box: [minX, minY, maxX, maxY], area };
  });
}

/** Smallest wins where simplified outlines overlap, matching the map's enclave rule. */
export function regionAtPlanePoint(
  outlines: ReadonlyArray<PreparedRegionOutline>,
  point: PlanePoint,
  wrapWidth: number,
): string | null {
  const wrapped: PlanePoint = [wrap(point[0], wrapWidth), point[1]];
  let found: PreparedRegionOutline | null = null;
  for (const outline of outlines) {
    if (!boxContains(outline.box, wrapped)) continue;
    const containment = contains(outline, wrapped);
    if (containment === 'boundary') return null;
    if (containment === 'inside' && (found === null || outline.area < found.area)) found = outline;
  }
  return found?.id ?? null;
}

/**
 * Finds the first real entry on the route. Intersections divide every segment into intervals;
 * classifying their midpoints means a tangent never becomes an entry and the returned point can
 * remain exactly on the boundary rather than being nudged into either side.
 */
export function firstEntryInRegion(
  path: ReadonlyArray<PlanePoint>,
  regionId: string,
  outlines: ReadonlyArray<PreparedRegionOutline>,
  wrapWidth: number,
): RegionEntry | null {
  if (path.length < 2 || !outlines.some((outline) => outline.id === regionId)) return null;
  let wasInside = false;
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const from = path[segmentIndex]!;
    const rawTo = path[segmentIndex + 1]!;
    const to: PlanePoint = [unwrapNear(rawTo[0], from[0], wrapWidth), rawTo[1]];
    const cuts = intersectionsAlong(from, to, outlines, wrapWidth);
    for (let rank = 0; rank < cuts.length - 1; rank += 1) {
      const start = cuts[rank]!;
      const end = cuts[rank + 1]!;
      if (end - start <= TOLERANCE) continue;
      const middle = interpolate(from, to, (start + end) / 2);
      const isInside = regionAtPlanePoint(outlines, middle, wrapWidth) === regionId;
      if (isInside && !wasInside) {
        const point = interpolate(from, to, start);
        return {
          point: [wrap(point[0], wrapWidth), point[1]],
          segmentIndex,
          fraction: start,
        };
      }
      wasInside = isInside;
    }
  }
  return null;
}

export function pointOnRegionBoundary(
  outlines: ReadonlyArray<PreparedRegionOutline>,
  regionId: string,
  point: PlanePoint,
  wrapWidth: number,
): boolean {
  const wrapped: PlanePoint = [wrap(point[0], wrapWidth), point[1]];
  for (const outline of outlines) {
    if (outline.id !== regionId) continue;
    for (const shift of [-wrapWidth, 0, wrapWidth]) {
      for (const ring of outline.rings) {
        for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
          const start = ring[previous]!;
          const end = ring[index]!;
          if (onSegment(wrapped, [start[0] + shift, start[1]], [end[0] + shift, end[1]])) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function intersectionsAlong(
  from: PlanePoint,
  to: PlanePoint,
  outlines: ReadonlyArray<PreparedRegionOutline>,
  wrapWidth: number,
): ReadonlyArray<number> {
  const found = [0, 1];
  const segmentBox: PlaneBox = [
    Math.min(from[0], to[0]),
    Math.min(from[1], to[1]),
    Math.max(from[0], to[0]),
    Math.max(from[1], to[1]),
  ];
  for (const outline of outlines) {
    for (const shift of [-wrapWidth, 0, wrapWidth]) {
      const shiftedBox: PlaneBox = [
        outline.box[0] + shift,
        outline.box[1],
        outline.box[2] + shift,
        outline.box[3],
      ];
      if (!boxesOverlap(segmentBox, shiftedBox)) continue;
      for (const ring of outline.rings) {
        for (let index = 1; index < ring.length; index += 1) {
          const start = ring[index - 1]!;
          const end = ring[index]!;
          const fraction = intersectionFraction(
            from,
            to,
            [start[0] + shift, start[1]],
            [end[0] + shift, end[1]],
          );
          if (fraction !== null) found.push(fraction);
        }
      }
    }
  }
  return [...found]
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || value - values[index - 1]! > TOLERANCE);
}

function intersectionFraction(
  a: PlanePoint,
  b: PlanePoint,
  c: PlanePoint,
  d: PlanePoint,
): number | null {
  const route: PlanePoint = [b[0] - a[0], b[1] - a[1]];
  const edge: PlanePoint = [d[0] - c[0], d[1] - c[1]];
  const denominator = cross(route, edge);
  if (Math.abs(denominator) <= TOLERANCE) return null;
  const offset: PlanePoint = [c[0] - a[0], c[1] - a[1]];
  const alongRoute = cross(offset, edge) / denominator;
  const alongEdge = cross(offset, route) / denominator;
  return alongRoute >= -TOLERANCE &&
    alongRoute <= 1 + TOLERANCE &&
    alongEdge >= -TOLERANCE &&
    alongEdge <= 1 + TOLERANCE
    ? Math.max(0, Math.min(1, alongRoute))
    : null;
}

function contains(
  outline: PreparedRegionOutline,
  point: PlanePoint,
): 'inside' | 'outside' | 'boundary' {
  let inside = false;
  for (const ring of outline.rings) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const a = ring[previous]!;
      const b = ring[index]!;
      if (onSegment(point, a, b)) return 'boundary';
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      ) {
        inside = !inside;
      }
    }
  }
  return inside ? 'inside' : 'outside';
}

function onSegment(point: PlanePoint, start: PlanePoint, end: PlanePoint): boolean {
  const edge: PlanePoint = [end[0] - start[0], end[1] - start[1]];
  const offset: PlanePoint = [point[0] - start[0], point[1] - start[1]];
  return (
    Math.abs(cross(edge, offset)) <= TOLERANCE &&
    point[0] >= Math.min(start[0], end[0]) - TOLERANCE &&
    point[0] <= Math.max(start[0], end[0]) + TOLERANCE &&
    point[1] >= Math.min(start[1], end[1]) - TOLERANCE &&
    point[1] <= Math.max(start[1], end[1]) + TOLERANCE
  );
}

function twiceArea(ring: ReadonlyArray<PlanePoint>): number {
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    total += current[0] * next[1] - next[0] * current[1];
  }
  return total;
}

const cross = (a: PlanePoint, b: PlanePoint): number => a[0] * b[1] - a[1] * b[0];

const interpolate = (from: PlanePoint, to: PlanePoint, fraction: number): PlanePoint => [
  from[0] + (to[0] - from[0]) * fraction,
  from[1] + (to[1] - from[1]) * fraction,
];

const wrap = (x: number, width: number): number => ((x % width) + width) % width;

const unwrapNear = (x: number, reference: number, width: number): number => {
  const wrapped = wrap(x, width);
  const turns = Math.round((reference - wrapped) / width);
  return wrapped + turns * width;
};

const boxContains = (box: PlaneBox, point: PlanePoint): boolean =>
  point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];

const boxesOverlap = (a: PlaneBox, b: PlaneBox): boolean =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
