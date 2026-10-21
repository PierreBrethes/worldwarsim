import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from 'three';
import { Earcut } from 'three/src/extras/Earcut.js';
import type { WorldFrame } from './frame';

/**
 * **The one adapter from the atlas to three** (ADR 0034): the atlas speaks in arcs and polygons
 * of map units, the board in geometry laid flat on the sheet. Every layer read off the atlas goes
 * through here, so none can sit a hair off another.
 */
type Sheet = Pick<WorldFrame, 'centerX' | 'centerY'>;

/** Within a hundredth of a unit of the sheet's edge, a point lies on the cut: the cut's own points
 *  sit within four thousandths, the nearest true shore (Fiji, Tuvalu) twenty. */
const SEAM_TOLERANCE = 0.01;

/**
 * **La coupe de l'antiméridien n'est pas une frontière** (ADR 0034) : la Tchoukotka et les Fidji y
 * sont coupées, et la coupe n'a, d'aucun côté, que le bord de la feuille. Une coupe prolonge
 * parfois la vraie ligne dans le même arc : c'est le segment qu'on retire, pas l'arc. La côte et
 * le contour la retirent par ce seul calcul.
 */
export function offTheSeam(
  points: Float32Array,
  frame: Pick<WorldFrame, 'edgeAtLatitude' | 'lonLatAt'>,
): Float32Array[] {
  const onSeam = (x: number, y: number) => {
    const { westX, eastX } = frame.edgeAtLatitude(frame.lonLatAt(x, y)[1]);
    return Math.min(Math.abs(x - westX), Math.abs(x - eastX)) < SEAM_TOLERANCE;
  };
  const runs: Float32Array[] = [];
  let start = 0;
  for (let i = 2; i <= points.length; i += 2) {
    const cut =
      i === points.length ||
      (onSeam(points[i - 2]!, points[i - 1]!) && onSeam(points[i]!, points[i + 1]!));
    if (!cut) continue;
    if (i - start >= 4) runs.push(points.subarray(start, i));
    start = i;
  }
  return runs;
}

/** Polylines as segment pairs, `[x, height, z]` twice per segment: what `LineSegments` and
 *  `LineSegmentsGeometry.setPositions` both read. */
export function lineGeometry(
  lines: ReadonlyArray<{ readonly points: Float32Array }>,
  frame: Sheet,
  height: number,
): Float32Array {
  let segments = 0;
  for (const { points } of lines) segments += Math.max(0, points.length / 2 - 1);
  const out = new Float32Array(segments * 6);
  let k = 0;
  for (const { points } of lines)
    for (let i = 2; i < points.length; i += 2) {
      out.set([points[i - 2]! - frame.centerX, height, points[i - 1]! - frame.centerY], k);
      out.set([points[i]! - frame.centerX, height, points[i + 1]! - frame.centerY], k + 3);
      k += 6;
    }
  return out;
}

/**
 * Polygons, holes included, triangulated flat on the sheet at `height`. Earcut on the flat rings,
 * without `Shape`: a `Vector2` per point and the curve walk doubled the time of the near level.
 */
export function fillGeometry(
  polygons: ReadonlyArray<{
    readonly outer: Float32Array;
    readonly holes: readonly Float32Array[];
  }>,
  frame: Sheet,
  height: number,
): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const { outer, holes } of polygons) {
    const flat = new Float32Array(holes.reduce((sum, hole) => sum + hole.length, outer.length));
    const holeStarts: number[] = [];
    flat.set(outer);
    let at = outer.length;
    for (const hole of holes) {
      holeStarts.push(at / 2);
      flat.set(hole, at);
      at += hole.length;
    }
    const base = positions.length / 3;
    for (let i = 0; i < flat.length; i += 2)
      positions.push(flat[i]! - frame.centerX, height, flat[i + 1]! - frame.centerY);
    // Earcut winds every triangle one way in (x, y); laid down as (x, z), that way faces the
    // ground, so each triangle is turned over.
    const triangles = Earcut.triangulate(flat as unknown as number[], holeStarts, 2);
    for (let t = 0; t < triangles.length; t += 3)
      indices.push(base + triangles[t]!, base + triangles[t + 2]!, base + triangles[t + 1]!);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute(
      new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      3,
    ),
  );
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  return geometry;
}

/** A geometry's arrays alone: what a worker builds and hands over without a copy. */
export type GeometryData = {
  readonly attributes: Readonly<
    Record<string, { readonly array: Float32Array; readonly itemSize: number }>
  >;
  readonly index: Uint32Array | null;
};

export const geometryData = (geometry: BufferGeometry): GeometryData => ({
  attributes: Object.fromEntries(
    Object.entries(geometry.attributes).map(([name, attribute]) => [
      name,
      { array: attribute.array as Float32Array, itemSize: attribute.itemSize },
    ]),
  ),
  index: (geometry.index?.array as Uint32Array | undefined) ?? null,
});

/** The geometry around the arrays, which it reads in place. */
export function fromGeometryData({ attributes, index }: GeometryData): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, { array, itemSize }] of Object.entries(attributes))
    geometry.setAttribute(name, new BufferAttribute(array, itemSize));
  if (index !== null) geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/** Every buffer under a value, each once: the transfer list of a worker's answer. */
export function buffersOf(value: unknown, found = new Set<ArrayBuffer>()): ArrayBuffer[] {
  if (ArrayBuffer.isView(value)) found.add(value.buffer as ArrayBuffer);
  else if (value !== null && typeof value === 'object')
    for (const child of Object.values(value)) buffersOf(child, found);
  return [...found];
}
