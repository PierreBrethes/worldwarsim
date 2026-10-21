import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  Uint32BufferAttribute,
} from 'three';
import { PALETTE } from './palette';
import { RECESSION, SEA_LEVEL, type WorldFrame } from './frame';

const WASH_WIDTH = 0.8;
const SHORE_OPACITY = 0.18;
const WASH_LIFT = 0.002;
const JOINT_STEP = Math.PI / 12;
const OUTLINE_STEP = 0.4;
/** Beyond this, the miter of a re-entrant concave angle would head out to sea. */
const MITER_LIMIT = 1.8;

type Point = readonly [x: number, z: number];

type Polygon = { readonly outer: Float32Array; readonly holes: readonly Float32Array[] };

/**
 * The wash brushed along a shoreline: an ink that starts at the coast stroke and fades
 * seaward. Geometric, not baked — which is what keeps it crisp at the tightest zoom, where
 * a band of texels pixelates.
 *
 * It follows the land's own rings, merged across every border (ADR 0034): the coast the stroke
 * draws, the antimeridian's cut aside, which runs off the sheet. A lake is a hole: its wash turns
 * inward, onto the water.
 */
export function washGeometry(
  land: ReadonlyArray<Polygon>,
  frame: Pick<WorldFrame, 'centerX' | 'centerY'>,
): BufferGeometry {
  const ribbon = new Ribbon(new Color(PALETTE.seaInk), SEA_LEVEL + WASH_LIFT);

  // A pixel takes the ink of the first ribbon over it (the stencil): the longest shores go first,
  // or each islet's ribbon would cut a pale wedge out of the mainland's.
  const rings = land
    .flatMap(({ outer, holes }) => [
      { ring: outer, lake: false },
      ...holes.map((ring) => ({ ring, lake: true })),
    ])
    .sort((a, b) => b.ring.length - a.ring.length);
  for (const { ring, lake } of rings) {
    const trace = Array.from(
      { length: ring.length / 2 },
      (_, i) => [ring[2 * i]! - frame.centerX, ring[2 * i + 1]! - frame.centerY] as const,
    );
    const kept = coarsen(trace);
    const outline = kept.map((index) => trace[index]!);
    if (outline.length < 3) continue;
    ribbon.ring(outline, lake ? -orientation(outline) : orientation(outline));
    ribbon.bays(trace, kept);
  }
  return ribbon.geometry();
}

export function buildCoastalWash(
  geometry: BufferGeometry,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetUnits: RECESSION.wash,
      side: DoubleSide,
      // A pixel takes the ink only once: without the stencil, every ribbon overlap — capes,
      // islets, straits — would ink twice and draw a sun on the water.
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: NotEqualStencilFunc,
      stencilZPass: ReplaceStencilOp,
    }),
  );
  // The sea is opaque, hence already drawn: the rank only orders the wash against the other
  // transparents laid on the ground.
  mesh.renderOrder = 1;
  return mesh;
}

class Ribbon {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  constructor(
    private readonly ink: Color,
    private readonly altitude: number,
  ) {}

  /**
   * A ring, closed ribbon. Two regimes at the corner, and that is the whole difficulty: at
   * a salient angle the two quads leave an empty wedge, which a fan closes; at a re-entrant
   * one they overlap, and the wash would ink twice there — a shared miter splices them.
   */
  ring(outline: ReadonlyArray<Point>, winding: number): void {
    const normals = outline.map((point, index) =>
      outwardNormal(point, outline[(index + 1) % outline.length]!, winding),
    );

    const entries: Point[] = [];
    const exits: Point[] = [];
    const fans: Array<{
      apex: Point;
      from: Point;
      to: Point;
      angle: number;
    } | null> = [];

    outline.forEach((vertex, index) => {
      const incoming = normals[(index - 1 + outline.length) % outline.length]!;
      const outgoing = normals[index]!;
      const cross = incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
      const angle = Math.atan2(cross, incoming[0] * outgoing[0] + incoming[1] * outgoing[1]);

      // The miter splices the corner on both sides as long as it stays short: it leaves
      // neither a slit at the salient angle nor an overlap at the re-entrant one. In a
      // hairpin it heads off tangentially, and the fan takes over.
      const miter = bevel(vertex, incoming, outgoing);
      if (miter) {
        exits[index] = miter;
        entries[index] = miter;
        fans[index] = null;
        return;
      }

      exits[index] = shifted(vertex, incoming, WASH_WIDTH);
      entries[index] = shifted(vertex, outgoing, WASH_WIDTH);
      fans[index] =
        angle * winding > 0 ? { apex: vertex, from: incoming, to: outgoing, angle } : null;
    });

    outline.forEach((vertex, index) => {
      const next = (index + 1) % outline.length;
      this.quad(vertex, entries[index]!, outline[next]!, exits[next]!);
      const fan = fans[index];
      if (fan) {
        this.fan(fan.apex, fan.from, fan.to, fan.angle);
      }
    });
  }

  /**
   * **The wash starts at the coast, not at the coarsened trace** : a bay the trace cuts across
   * stayed unwashed, a crisp pale wedge between the shore and the ribbon. Each chord fans over
   * the vertices it skipped, at shore ink; whatever of the fan lies on land is under the sheet,
   * and the stencil keeps an overlap from inking twice.
   */
  bays(trace: ReadonlyArray<Point>, kept: ReadonlyArray<number>): void {
    kept.forEach((from, k) => {
      const to = k + 1 < kept.length ? kept[k + 1]! : kept[0]! + trace.length;
      if (to - from < 2) return;
      const base = this.positions.length / 3;
      for (let i = from; i <= to; i++) this.shore(trace[i % trace.length]!);
      for (let i = 1; i < to - from; i++) this.indices.push(base, base + i, base + i + 1);
    });
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 4));
    geometry.setIndex(new Uint32BufferAttribute(this.indices, 1));
    return geometry;
  }

  private quad(shoreA: Point, seaA: Point, shoreB: Point, seaB: Point): void {
    const base = this.positions.length / 3;
    this.shore(shoreA);
    this.sea(seaA);
    this.shore(shoreB);
    this.sea(seaB);
    this.indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }

  private fan(apex: Point, from: Point, to: Point, angle: number): void {
    const steps = Math.ceil(Math.abs(angle) / JOINT_STEP);
    const center = this.positions.length / 3;
    this.shore(apex);
    for (let i = 0; i <= steps; i++) {
      // The last ray takes the outgoing normal verbatim: rebuilt by rotation, it would miss
      // the next quad's edge by a hair, and the hair shows bright on the water.
      const turned = angle * (i / steps);
      const cos = Math.cos(turned);
      const sin = Math.sin(turned);
      const normal: Point =
        i === steps ? to : [from[0] * cos - from[1] * sin, from[0] * sin + from[1] * cos];
      this.sea(shifted(apex, normal, WASH_WIDTH));
    }
    for (let i = 0; i < steps; i++) this.indices.push(center, center + 1 + i, center + 2 + i);
  }

  private shore(point: Point): void {
    this.positions.push(point[0], this.altitude, point[1]);
    this.colors.push(this.ink.r, this.ink.g, this.ink.b, SHORE_OPACITY);
  }

  private sea(point: Point): void {
    this.positions.push(point[0], this.altitude, point[1]);
    this.colors.push(this.ink.r, this.ink.g, this.ink.b, 0);
  }
}

const shifted = (point: Point, direction: Point, distance: number): Point => [
  point[0] + direction[0] * distance,
  point[1] + direction[1] * distance,
];

/**
 * The point where the two outer edges of a re-entrant angle meet. `null` when the miter
 * exceeds the limit: the corner is then left open, two frank edges overlapping — the
 * stencil absorbs the overlap, a several-unit needle it does not.
 */
function bevel(vertex: Point, incoming: Point, outgoing: Point): Point | null {
  const bx = incoming[0] + outgoing[0];
  const bz = incoming[1] + outgoing[1];
  const length = Math.hypot(bx, bz);
  if (length < 1e-6) return null;
  const ux = bx / length;
  const uz = bz / length;
  const cosine = ux * outgoing[0] + uz * outgoing[1];
  if (cosine < 1 / MITER_LIMIT) return null;
  return shifted(vertex, [ux, uz], WASH_WIDTH / cosine);
}

/**
 * The outline is far finer than the wash is wide: a 0.02-unit fjord notch, offset to 0.8,
 * folds over its neighbors and the ribbon shoots off in needles. The trace is therefore
 * coarsened to half a wash before offsetting — the sharp silhouette stays the country's,
 * drawn by its sheet; the wash only has to border it.
 */
function coarsen(outline: ReadonlyArray<Point>): ReadonlyArray<number> {
  const kept: number[] = [];
  let anchor: Point | null = null;
  outline.forEach((point, index) => {
    if (anchor === null || Math.hypot(point[0] - anchor[0], point[1] - anchor[1]) >= OUTLINE_STEP) {
      kept.push(index);
      anchor = point;
    }
  });
  // An island smaller than the step would not survive coarsening: it keeps its trace.
  return kept.length >= 3 ? kept : outline.map((_, index) => index);
}

/** +1 when the ring turns counterclockwise in the (x, z) plane, -1 otherwise. */
function orientation(outline: ReadonlyArray<Point>): number {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % outline.length]!;
    area += ax * bz - bx * az;
  }
  return area >= 0 ? 1 : -1;
}

function outwardNormal(a: Point, b: Point, winding: number): Point {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return [0, 0];
  return [(dz / length) * winding, (-dx / length) * winding];
}
