import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  ShaderMaterial,
  Uint32BufferAttribute,
} from 'three';
import type { World } from '@/domain/world';
import type { AmbientLayer } from './ambience';
import type { Curvature } from './curvature';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from './regions';
import { PALETTE } from './palette';
import { SEA_LEVEL, type WorldFrame } from './frame';

const WASH_WIDTH = 0.8;
const SHORE_OPACITY = 0.35;
const WASH_LIFT = 0.005;
const JOINT_STEP = Math.PI / 12;
const OUTLINE_STEP = 0.4;
/** Beyond this, the miter of a re-entrant concave angle would head out to sea. */
const MITER_LIMIT = 1.8;

type Point = readonly [x: number, z: number];

/**
 * The wash brushed along a shoreline: an ink that starts at the coast stroke and fades
 * seaward. Geometric, not baked — which is what keeps it crisp at the tightest zoom, where
 * a band of texels pixelates.
 *
 * The ribbon follows the whole outline, coast or not: a segment running along a land border
 * passes under the neighboring country, whose slab plunges below the sea. Detecting coasts
 * would cost a neighborhood pass for a result depth already provides.
 */
export function buildCoastalWash(
  world: World,
  frame: WorldFrame,
  curvature: Curvature,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const ribbon = new Ribbon(new Color(PALETTE.seaInk), SEA_LEVEL + WASH_LIFT);

  for (const country of world.countries) {
    for (const ring of country.rings) {
      const outline = coarsen(
        ring.map(([px, py]) => [px - frame.centerX, py - frame.centerY] as const),
      );
      if (outline.length < 3) continue;
      ribbon.ring(outline, orientation(outline));
    }
  }

  const mesh = new Mesh(
    curvature.register(ribbon.geometry()),
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
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
 * drawn by its slab; the wash only has to border it.
 */
function coarsen(outline: ReadonlyArray<Point>): ReadonlyArray<Point> {
  const kept: Point[] = [];
  let anchor: Point | null = null;
  for (const point of outline) {
    if (anchor === null || Math.hypot(point[0] - anchor[0], point[1] - anchor[1]) >= OUTLINE_STEP) {
      kept.push(point);
      anchor = point;
    }
  }
  // An island smaller than the step would not survive coarsening: it keeps its trace.
  return kept.length >= 3 ? kept : outline;
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

const FOAM_HZ = 12;
const FOAM_PERIOD_S = 3.5;
const FOAM_RINGS = 3;
const FOAM_RING_OPACITY = 0.25;
const FOAM_RING_WIDTH = 0.07;
const FOAM_EDGE_OPACITY = 0.32;
const FOAM_EDGE_WIDTH = 0.08;
const PAPER = '#f4ecd8';

const FOAM_VERTEX = `
varying float vOffshore;
void main() {
  // The wash's own ink fades linearly seaward: its alpha is already the distance to the coast.
  vOffshore = 1.0 - color.a / ${SHORE_OPACITY.toFixed(4)};
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FOAM_FRAGMENT = `
uniform vec3 paper;
uniform float time;
uniform float share;
varying float vOffshore;
void main() {
  float foam = ${FOAM_EDGE_OPACITY.toFixed(4)} * (1.0 - smoothstep(0.0, ${FOAM_EDGE_WIDTH.toFixed(4)}, vOffshore));
  for (int i = 0; i < ${FOAM_RINGS}; i++) {
    float reach = fract(time / ${FOAM_PERIOD_S.toFixed(4)} + float(i) / ${FOAM_RINGS}.0);
    float ring = exp(-pow((vOffshore - reach) / ${FOAM_RING_WIDTH.toFixed(4)}, 2.0));
    foam = max(foam, ${FOAM_RING_OPACITY.toFixed(4)} * (1.0 - reach) * ring);
  }
  gl_FragColor = vec4(paper, foam * share);
  #include <colorspace_fragment>
}`;

/**
 * **L'écume** (décision de Pierre, 10/10) : un ressac qui respire le long des côtes, au rapproché
 * seulement — au loin, le lavis suffit. Elle borde le lavis sur sa propre géométrie, donc suit
 * la courbure sans rien recalculer.
 */
export class CoastalFoam implements AmbientLayer {
  readonly fx = 'sea' as const;
  readonly hz = FOAM_HZ;
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly uniforms = {
    paper: { value: new Color(PAPER) },
    time: { value: 0 },
    share: { value: 0 },
  };

  constructor(wash: Mesh<BufferGeometry, MeshBasicMaterial>) {
    this.mesh = new Mesh(
      wash.geometry,
      new ShaderMaterial({
        vertexShader: FOAM_VERTEX,
        fragmentShader: FOAM_FRAGMENT,
        uniforms: this.uniforms,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        // Its own stencil value: the wash has already marked these pixels with 1.
        stencilWrite: true,
        stencilRef: 2,
        stencilFunc: NotEqualStencilFunc,
        stencilZPass: ReplaceStencilOp,
      }),
    );
    this.mesh.renderOrder = wash.renderOrder + 1;
    this.mesh.visible = false;
  }

  /** The regions' fade, threshold for threshold: the foam belongs to the close view. */
  fade(cameraDistance: number): void {
    const share = Math.min(
      1,
      Math.max(
        0,
        (REGIONS_GONE_DISTANCE - cameraDistance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
      ),
    );
    this.uniforms.share.value = share;
    this.mesh.visible = share > 0.01;
  }

  frame(time: number): void {
    this.uniforms.time.value = time;
  }
}
