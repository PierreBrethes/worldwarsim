/**
 * The geographic base of the map (ADR 0034): one topology of admin-1 regions with shared arcs,
 * baked by `scripts/generate-atlas.mjs` in the map's projection (400 × 208 u). Every line and
 * every surface is read off the same arcs, so two layers can never disagree on a border.
 *
 * `public/atlas.json` holds the regions and the far arcs; `public/atlas-near.json` the near
 * arcs, in the same order. A point is `[x, y]` in map units, a line or ring a flat
 * `Float32Array` of x, y pairs; a ring does not repeat its first point.
 */

type Detail = 'near' | 'far';

export type AtlasRegion = { readonly id: string; readonly country: string; readonly name: string };

type ArcRefs = number[];
type AtlasGeometry = { id: string; properties: { country: string; name: string } } & (
  { type: 'Polygon'; arcs: ArcRefs[] } | { type: 'MultiPolygon'; arcs: ArcRefs[][] }
);

/** A TopoJSON topology, quantized, its arcs delta-encoded. */
export type AtlasFile = {
  type: 'Topology';
  transform: { scale: [number, number]; translate: [number, number] };
  objects: { regions: { type: 'GeometryCollection'; geometries: AtlasGeometry[] } };
  arcs: number[][][];
};

/** One arc; `left` lies on the left hand of whoever walks its points in order. `null` is the sea. */
type Border = {
  readonly points: Float32Array;
  readonly left: AtlasRegion | null;
  readonly right: AtlasRegion | null;
};

type Shape = { readonly outer: Float32Array; readonly holes: readonly Float32Array[] };

export type Atlas = {
  readonly regions: readonly AtlasRegion[];
  /** The arcs whose two sides `differ` tells apart, each once. */
  borders(
    differ: (left: AtlasRegion | null, right: AtlasRegion | null) => boolean,
    detail: Detail,
  ): Border[];
  /** The regions sharing a key merged into polygons; a `null` key leaves a region out. */
  shapes(key: (region: AtlasRegion) => string | null, detail: Detail): Map<string, Shape[]>;
  /** A point on a line goes to what lies east of it: a border to the eastern region. */
  regionAt(point: readonly [number, number], detail: Detail): AtlasRegion | null;
};

/** `public/atlas-near.json`: the near arcs, in the atlas's order, with their quantum. */
export type NearFile = Pick<AtlasFile, 'transform' | 'arcs'>;

export function decodeAtlas(file: AtlasFile, near?: NearFile): Atlas {
  const geometries = file.objects.regions.geometries;
  const regions = geometries.map(({ id, properties }) => ({
    id,
    country: properties.country,
    name: properties.name,
  }));
  const polygons = geometries.map((geometry) =>
    geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs,
  );
  const decoded: Record<Detail, Float32Array[] | undefined> = {
    far: decodeArcs(file.arcs, file.transform),
    near: near && decodeArcs(near.arcs, near.transform),
  };
  const arcsOf = (detail: Detail) => {
    const arcs = decoded[detail];
    if (!arcs) throw new Error(`atlas: the ${detail} arcs were not loaded`);
    return arcs;
  };

  // Each arc is walked forward by the region on one side and backward by the one on the other.
  const forwardOwner = new Int32Array(file.arcs.length).fill(-1);
  const backwardOwner = new Int32Array(file.arcs.length).fill(-1);
  polygons.forEach((list, owner) => {
    for (const polygon of list)
      for (const ring of polygon)
        for (const ref of ring) (ref >= 0 ? forwardOwner : backwardOwner)[arcIndex(ref)] = owner;
  });
  // An exterior ring keeps its interior on one hand, the same for every arc: which one is the
  // file's winding, read once from the first ring that has an area.
  let insideOnLeft = true;
  findWinding: for (const list of polygons)
    for (const polygon of list) {
      const area = signedArea(ringPoints(arcsOf('far'), polygon[0]!));
      if (area === 0) continue;
      insideOnLeft = area > 0;
      break findWinding;
    }
  const regionOf = (owner: number) => (owner < 0 ? null : regions[owner]!);

  const ringCache: Partial<Record<Detail, Float32Array[][]>> = {};
  const regionRings = (detail: Detail) =>
    (ringCache[detail] ??= polygons.map((list) =>
      list.flatMap((polygon) =>
        polygon.map((ring) => ringPoints(arcsOf(detail), ring)).filter(hasArea),
      ),
    ));
  const boxCache: Partial<Record<Detail, Float64Array[]>> = {};
  const regionBoxes = (detail: Detail) => (boxCache[detail] ??= regionRings(detail).map(boxOf));

  return {
    regions,
    borders(differ, detail) {
      const arcs = arcsOf(detail);
      const out: Border[] = [];
      arcs.forEach((points, arc) => {
        const forward = regionOf(forwardOwner[arc]!);
        const backward = regionOf(backwardOwner[arc]!);
        const [left, right] = insideOnLeft ? [forward, backward] : [backward, forward];
        if (differ(left, right)) out.push({ points, left, right });
      });
      return out;
    },
    shapes(key, detail) {
      const arcs = arcsOf(detail);
      const keyOf = (owner: number) => (owner < 0 ? null : key(regions[owner]!));
      const pieces = new Map<string, Float32Array[]>();
      const add = (k: string | null, points: Float32Array) => {
        if (k !== null) (pieces.get(k) ?? pieces.set(k, []).get(k)!).push(points);
      };
      arcs.forEach((points, arc) => {
        const forward = keyOf(forwardOwner[arc]!);
        const backward = keyOf(backwardOwner[arc]!);
        if (forward === backward) return;
        add(forward, points);
        add(backward, reversed(points));
      });
      const out = new Map<string, Shape[]>();
      for (const [k, list] of pieces) {
        const shapes = withHoles(chainRings(list).filter(hasArea), insideOnLeft);
        if (shapes.length > 0) out.set(k, shapes);
      }
      return out;
    },
    regionAt([x, y], detail) {
      const boxes = regionBoxes(detail);
      const rings = regionRings(detail);
      for (let owner = 0; owner < regions.length; owner++) {
        const box = boxes[owner]!;
        if (x < box[0]! || x > box[2]! || y < box[1]! || y > box[3]!) continue;
        let inside = false;
        for (const ring of rings[owner]!) if (contains(ring, x, y)) inside = !inside;
        if (inside) return regions[owner]!;
      }
      return null;
    },
  };
}

const arcIndex = (ref: number) => (ref >= 0 ? ref : ~ref);

function decodeArcs(
  arcs: number[][][],
  { scale: [sx, sy], translate: [tx, ty] }: AtlasFile['transform'],
): Float32Array[] {
  return arcs.map((arc) => {
    const out = new Float32Array(arc.length * 2);
    let x = 0;
    let y = 0;
    arc.forEach(([dx, dy], i) => {
      x += dx!;
      y += dy!;
      out[2 * i] = x * sx + tx;
      out[2 * i + 1] = y * sy + ty;
    });
    return out;
  });
}

function reversed(points: Float32Array): Float32Array {
  const out = new Float32Array(points.length);
  for (let i = 0, n = points.length / 2; i < n; i++) {
    out[2 * i] = points[2 * (n - 1 - i)]!;
    out[2 * i + 1] = points[2 * (n - 1 - i) + 1]!;
  }
  return out;
}

/** Arcs laid end to end, the first point of each after the first dropped, the closing one too. */
function joined(pieces: Float32Array[]): Float32Array {
  const coordinates: number[] = [];
  for (const piece of pieces)
    for (let i = coordinates.length === 0 ? 0 : 2; i < piece.length; i++)
      coordinates.push(piece[i]!);
  return Float32Array.from(coordinates.slice(0, -2));
}

const ringPoints = (arcs: Float32Array[], ring: ArcRefs) =>
  joined(ring.map((ref) => (ref >= 0 ? arcs[ref]! : reversed(arcs[~ref]!))));

/** Oriented arcs chained into closed rings, each arc taken once. */
function chainRings(pieces: Float32Array[]): Float32Array[] {
  const keyAt = (points: Float32Array, i: number) => `${points[2 * i]},${points[2 * i + 1]}`;
  const startingAt = new Map<string, Float32Array[]>();
  for (const piece of pieces) {
    const start = keyAt(piece, 0);
    (startingAt.get(start) ?? startingAt.set(start, []).get(start)!).push(piece);
  }
  const rings: Float32Array[] = [];
  for (const first of pieces) {
    const from = startingAt.get(keyAt(first, 0))!;
    if (!from.includes(first)) continue;
    from.splice(from.indexOf(first), 1);
    const chain = [first];
    const start = keyAt(first, 0);
    let end = keyAt(first, first.length / 2 - 1);
    while (end !== start) {
      const next = startingAt.get(end)?.pop();
      if (!next) throw new Error(`atlas: a border stops short at ${end}`);
      chain.push(next);
      end = keyAt(next, next.length / 2 - 1);
    }
    rings.push(joined(chain));
  }
  return rings;
}

/** Each hole goes to the smallest outer ring around it. */
function withHoles(rings: Float32Array[], insideOnLeft: boolean): Shape[] {
  const isOuter = (ring: Float32Array) => signedArea(ring) > 0 === insideOnLeft;
  const outers = rings
    .filter(isOuter)
    .map((outer) => ({ outer, holes: [] as Float32Array[], area: Math.abs(signedArea(outer)) }))
    .sort((a, b) => a.area - b.area);
  for (const hole of rings.filter((ring) => !isOuter(ring))) {
    const owner = outers.find(({ outer }) => contains(outer, hole[0]!, hole[1]!));
    if (!owner) throw new Error(`atlas: a hole at ${hole[0]},${hole[1]} lies in no outer ring`);
    owner.holes.push(hole);
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }));
}

function signedArea(ring: Float32Array): number {
  let sum = 0;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    sum += ring[2 * i]! * ring[2 * j + 1]! - ring[2 * j]! * ring[2 * i + 1]!;
  }
  return sum / 2;
}

const hasArea = (ring: Float32Array) => ring.length >= 6 && signedArea(ring) !== 0;

function contains(ring: Float32Array, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i]!;
    const yi = ring[2 * i + 1]!;
    const xj = ring[2 * j]!;
    const yj = ring[2 * j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boxOf(rings: Float32Array[]): Float64Array {
  const box = Float64Array.of(Infinity, Infinity, -Infinity, -Infinity);
  for (const ring of rings)
    for (let i = 0; i < ring.length; i += 2) {
      box[0] = Math.min(box[0]!, ring[i]!);
      box[1] = Math.min(box[1]!, ring[i + 1]!);
      box[2] = Math.max(box[2]!, ring[i]!);
      box[3] = Math.max(box[3]!, ring[i + 1]!);
    }
  return box;
}

/**
 * The pairs of segments of `arcs` (absolute integer points) that touch anywhere but at a shared
 * end, each segment as `[arc, index]`. Simplifying each arc alone can push a strait's two shores
 * across each other; the generator restores points until this comes back empty.
 */
export function findCrossings(
  arcs: ReadonlyArray<ReadonlyArray<ArrayLike<number>>>,
): [[number, number], [number, number]][] {
  const CELL = 512;
  const segments: [number, number][] = [];
  const cells = new Map<string, number[]>();
  arcs.forEach((arc, a) => {
    for (let i = 0; i + 1 < arc.length; i++) {
      const [px, py] = [arc[i]![0]!, arc[i]![1]!];
      const [qx, qy] = [arc[i + 1]![0]!, arc[i + 1]![1]!];
      if (px === qx && py === qy) continue;
      const id = segments.push([a, i]) - 1;
      for (
        let cx = Math.floor(Math.min(px, qx) / CELL);
        cx <= Math.floor(Math.max(px, qx) / CELL);
        cx++
      )
        for (
          let cy = Math.floor(Math.min(py, qy) / CELL);
          cy <= Math.floor(Math.max(py, qy) / CELL);
          cy++
        ) {
          const key = `${cx},${cy}`;
          (cells.get(key) ?? cells.set(key, []).get(key)!).push(id);
        }
    }
  });
  const ends = ([a, i]: [number, number]) => [arcs[a]![i]!, arcs[a]![i + 1]!] as const;
  const crossing: [number, number][] = [];
  const tested = new Set<number>();
  for (const ids of cells.values())
    for (let m = 0; m < ids.length; m++)
      for (let n = m + 1; n < ids.length; n++) {
        const [s, t] = [ids[m]!, ids[n]!];
        const pair = s * segments.length + t;
        if (tested.has(pair)) continue;
        tested.add(pair);
        if (segmentsConflict(...ends(segments[s]!), ...ends(segments[t]!))) crossing.push([s, t]);
      }
  return crossing
    .sort(([a, b], [c, d]) => a - c || b - d)
    .map(([s, t]) => [segments[s]!, segments[t]!]);
}

type Point = ArrayLike<number>;
const orientation = (a: Point, b: Point, c: Point) =>
  Math.sign((b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!));
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

function segmentsConflict(p: Point, q: Point, r: Point, s: Point): boolean {
  const shared = same(p, r) || same(p, s) ? p : same(q, r) || same(q, s) ? q : null;
  if (shared) {
    const a = same(shared, p) ? q : p;
    const b = same(shared, r) ? s : r;
    if (same(a, b)) return true;
    const along =
      (a[0]! - shared[0]!) * (b[0]! - shared[0]!) + (a[1]! - shared[1]!) * (b[1]! - shared[1]!);
    return orientation(shared, a, b) === 0 && along > 0;
  }
  const o1 = orientation(p, q, r);
  const o2 = orientation(p, q, s);
  const o3 = orientation(r, s, p);
  const o4 = orientation(r, s, q);
  if (o1 === 0 && o2 === 0) {
    const overlaps = (k: 0 | 1) =>
      Math.max(Math.min(p[k]!, q[k]!), Math.min(r[k]!, s[k]!)) <=
      Math.min(Math.max(p[k]!, q[k]!), Math.max(r[k]!, s[k]!));
    return overlaps(0) && overlaps(1);
  }
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}
