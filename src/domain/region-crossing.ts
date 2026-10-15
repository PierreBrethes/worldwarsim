export type PlanePoint = readonly [x: number, y: number];

export type RegionOutline = {
  readonly id: string;
  readonly rings: ReadonlyArray<ReadonlyArray<PlanePoint>>;
};

type PlaneBox = readonly [minX: number, minY: number, maxX: number, maxY: number];

export type PreparedRegionOutline = RegionOutline & {
  readonly box: PlaneBox;
  readonly area: number;
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

const wrap = (x: number, width: number): number => ((x % width) + width) % width;

const boxContains = (box: PlaneBox, point: PlanePoint): boolean =>
  point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
