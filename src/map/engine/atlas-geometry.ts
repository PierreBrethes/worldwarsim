import { BufferGeometry, Path, Shape, ShapeGeometry, Vector2 } from 'three';
import type { WorldFrame } from './frame';

/**
 * **The one adapter from the atlas to three** (ADR 0034): the atlas speaks in arcs and polygons
 * of map units, the board in geometry laid flat on the sheet. Every layer read off the atlas goes
 * through here, so none can sit a hair off another.
 */
type Sheet = Pick<WorldFrame, 'centerX' | 'centerY'>;

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

/** Polygons, holes included, triangulated flat on the sheet at `height`. */
export function fillGeometry(
  polygons: ReadonlyArray<{
    readonly outer: Float32Array;
    readonly holes: readonly Float32Array[];
  }>,
  frame: Sheet,
  height: number,
): BufferGeometry {
  // Drawn in the (x, y) plane, then laid down: y = -z before the turn, so z = y - centerY after.
  const vectors = (ring: Float32Array) =>
    Array.from(
      { length: ring.length / 2 },
      (_, i) => new Vector2(ring[2 * i]! - frame.centerX, -(ring[2 * i + 1]! - frame.centerY)),
    );
  const shapes = polygons.map(({ outer, holes }) => {
    const shape = new Shape(vectors(outer));
    shape.holes = holes.map((hole) => new Path(vectors(hole)));
    return shape;
  });
  const geometry = new ShapeGeometry(shapes);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);
  return geometry;
}
