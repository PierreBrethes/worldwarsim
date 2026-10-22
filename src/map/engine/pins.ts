import {
  BufferAttribute,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Camera,
} from 'three';
import { asClockTime } from '@/domain/duration';
import { nationInk } from '@/domain/nations';
import type { Pin } from '@/domain/pins';
import type { Rect } from '@/domain/poster-placement';
import { nearWeight } from './figurines/figurine';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { ARC_COLORS, PALETTE } from './palette';

export type PinHit =
  | { readonly kind: 'pin'; readonly id: string }
  | { readonly kind: 'cluster'; readonly ids: ReadonlyArray<string> };

/** Pins closer than this on screen, in CSS pixels, range into one cluster (maquette, `R`). */
const CLUSTER_PX = 11;
const CLUSTER_TOUCH_PX = 13;
/** A cluster's disc grows with the log of its count: 2 reads, 500 does not cover a country. */
const clusterRadius = (count: number): number => 7 + 5.2 * Math.log10(count);
/** What a single pin measures, in CSS pixels, by its shape and side. @a-mesurer */
const SINGLE_RADIUS = { pile: 4, building: 4, outpost: 5.5 } as const;
const SEEN_RADIUS = 4.6;
/** The trail behind a moving pin, in CSS pixels. */
const TRAIL_PX = 16;
/** Past this share of figurine a pin is too faint to take the pointer from it. */
const TAKES_POINTER = 0.5;
/** Above the threads (13), the pawns and the annotations: a pin is the head of all of them. */
const RANK = 20;
const ELEVATION = COUNTRY_THICKNESS + 0.01;

const STYLE = { filled: 0, hollow: 1, dotted: 2 } as const;
const RING = { none: 0, hover: 1, held: 2 } as const;

type Placed = { readonly pin: Pin; at: Vector3 | null };

type Mark = {
  readonly ids: ReadonlyArray<string>;
  readonly shape: Pin['shape'];
  readonly style: number;
  readonly ink: string;
  readonly center: Vector3;
  readonly sx: number;
  readonly sy: number;
  readonly radius: number;
  readonly weight: number;
  readonly mine: boolean;
  readonly trail: readonly [number, number];
  readonly ring: number;
  readonly hour: string | null;
};

type Point = {
  readonly placed: Placed;
  readonly sx: number;
  readonly sy: number;
  readonly weight: number;
};
type Cluster = { sx: number; sy: number; points: Point[] };

/**
 * **Clusters, on screen** (maquette `points-au-loin`, `cluster` then `settle`): greedy on a grid
 * of `radius` cells, then two clusters whose discs touch merge until none do. One pass costs
 * O(n) plus the clusters squared — computed when the camera moves, never at every frame.
 */
export function clusterPoints<P extends { readonly sx: number; readonly sy: number }>(
  points: ReadonlyArray<P>,
  radius: number,
): Array<{ sx: number; sy: number; points: P[] }> {
  const cells = new Map<string, Array<{ sx: number; sy: number; points: P[] }>>();
  const groups: Array<{ sx: number; sy: number; points: P[] }> = [];
  for (const point of points) {
    const cx = Math.floor(point.sx / radius);
    const cy = Math.floor(point.sy / radius);
    let home: (typeof groups)[number] | undefined;
    for (let i = -1; i <= 1 && home === undefined; i++)
      for (let j = -1; j <= 1 && home === undefined; j++)
        home = cells
          .get(`${cx + i}|${cy + j}`)
          ?.find((group) => Math.hypot(group.sx - point.sx, group.sy - point.sy) < radius);
    if (home === undefined) {
      home = { sx: point.sx, sy: point.sy, points: [] };
      groups.push(home);
      const key = `${cx}|${cy}`;
      cells.set(key, [...(cells.get(key) ?? []), home]);
    }
    home.points.push(point);
  }
  for (const group of groups) {
    group.sx = group.points.reduce((sum, point) => sum + point.sx, 0) / group.points.length;
    group.sy = group.points.reduce((sum, point) => sum + point.sy, 0) / group.points.length;
  }
  const radiusOf = (group: (typeof groups)[number]) =>
    group.points.length > 1 ? clusterRadius(group.points.length) : radius / 2;
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const [a, b] = [groups[i]!, groups[j]!];
        if (Math.hypot(a.sx - b.sx, a.sy - b.sy) >= radiusOf(a) + radiusOf(b) + 2) continue;
        const n = a.points.length + b.points.length;
        a.sx = (a.sx * a.points.length + b.sx * b.points.length) / n;
        a.sy = (a.sy * a.points.length + b.sy * b.points.length) / n;
        a.points.push(...b.points);
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
  }
  return groups;
}

/**
 * **Au loin, chaque pièce est une épingle** (#234, ADR 0026 §3 précisé) : rond pour une pile,
 * carré pour un bâtiment, losange pour un avant-poste ; plein à l'encre de sa nation pour ce qui
 * est à soi, creux à l'encre adverse pour un relevé, gris en pointillé avec son heure pour une
 * dernière position connue. Les épingles qui se touchent se rangent en grappe numérotée. Elle
 * monte quand la figurine s'efface (`nearWeight`).
 *
 * Deux maillages instanciés, deux appels de dessin : les formes, tracées par leur distance signée
 * dans le shader, et les chiffres. Elle ne demande aucune image à elle seule (`frame-demand`) :
 * les grappes se refont quand la caméra a bougé ou que les épingles ont changé, et une épingle
 * qui bouge suit l'image que son fil demande déjà.
 */
export class PinLayer {
  readonly group = new Group();
  private placed: Placed[] = [];
  /** The marks that stand still, clustered: redone only when the eye or the pins change. */
  private settled: Mark[] = [];
  private marks: Mark[] = [];
  private held: string | null = null;
  private hovered: string | null = null;
  private carried: Vector3 | null = null;
  private dirty = true;
  private readonly lastView = new Float32Array(18);
  private readonly shapes: InstancedDraw<typeof SHAPE_ATTRIBUTES>;
  private readonly glyphs: InstancedDraw<typeof GLYPH_ATTRIBUTES>;

  constructor(
    private readonly frame: WorldFrame,
    private readonly regionAnchor: (regionId: string) => Vector3 | null,
    private readonly touch = false,
  ) {
    this.shapes = new InstancedDraw(SHAPE_ATTRIBUTES, shapeMaterial());
    this.glyphs = new InstancedDraw(GLYPH_ATTRIBUTES, glyphMaterial());
    this.group.add(this.shapes.mesh, this.glyphs.mesh);
  }

  display(pins: ReadonlyArray<Pin>): void {
    this.placed = pins.map((pin) => ({ pin, at: null }));
    this.rebuild();
  }

  /** The regions landed under a building's anchor, or the frame changed: anchors are re-read. */
  rebuild(): void {
    for (const placed of this.placed) {
      const { anchor } = placed.pin;
      placed.at =
        anchor.kind === 'ground'
          ? this.frame.projectLonLat(anchor.lonLat, ELEVATION)
          : anchor.kind === 'region'
            ? this.regionAnchor(anchor.regionId)
            : null;
    }
    this.dirty = true;
  }

  /** The lifted pile (ADR 0026 §6): its pin stands out of any cluster, ringed in amber. */
  hold(id: string | null, carriedAt: Vector3 | null = null): void {
    if (id !== this.held) this.dirty = true;
    this.held = id;
    this.carried = carriedAt;
  }

  hover(id: string | null): void {
    if (id !== this.hovered) this.dirty = true;
    this.hovered = id;
  }

  isPinned(id: string): boolean {
    return this.placed.some((placed) => placed.pin.id === id);
  }

  /**
   * Lays the pins out for this eye. Clusters are redone only when the eye or the pins changed;
   * the heads of movements (`heads`, and the point ahead of each for its trail) every call.
   */
  layout(
    eye: Camera,
    width: number,
    height: number,
    heads: ReadonlyMap<string, Vector3>,
    aheads: ReadonlyMap<string, Vector3>,
    measuredFrom: Vector3 = eye.position,
  ): void {
    const view = this.lastView;
    const moved =
      view[16] !== width ||
      view[17] !== height ||
      eye.matrixWorld.elements.some((value, k) => view[k] !== value);
    if (moved) {
      view.set(eye.matrixWorld.elements);
      view[16] = width;
      view[17] = height;
    }
    const screen = (at: Vector3): [number, number, boolean] => {
      const v = scratch.copy(at).project(eye);
      const sx = ((v.x + 1) / 2) * width;
      const sy = ((1 - v.y) / 2) * height;
      const inside = v.z < 1 && sx > -40 && sy > -40 && sx < width + 40 && sy < height + 40;
      return [sx, sy, inside];
    };
    const weightAt = (at: Vector3) => 1 - nearWeight(at.distanceTo(measuredFrom));

    if (moved || this.dirty) {
      this.dirty = false;
      const points: Record<'mine' | 'seen', Point[]> = { mine: [], seen: [] };
      const alone: Point[] = [];
      for (const placed of this.placed) {
        // A frozen movement stands where it was last seen: its head no longer moves.
        if (placed.pin.anchor.kind === 'movementHead' && !('moving' in placed.pin))
          placed.at = heads.get(placed.pin.id) ?? null;
        if (placed.at === null || 'moving' in placed.pin) continue;
        const weight = weightAt(placed.at);
        if (weight <= 0) continue;
        const [sx, sy, inside] = screen(placed.at);
        if (!inside) continue;
        const point = { placed, sx, sy, weight };
        if (placed.pin.id === this.held) alone.push(point);
        else points[placed.pin.side === 'mine' ? 'mine' : 'seen'].push(point);
      }
      const radius = this.touch ? CLUSTER_TOUCH_PX : CLUSTER_PX;
      this.settled = [
        ...[...clusterPoints(points.mine, radius), ...clusterPoints(points.seen, radius)].map(
          (cluster) => this.markOf(cluster),
        ),
        ...alone.map((point) => this.markOf({ sx: point.sx, sy: point.sy, points: [point] })),
      ];
    }
    this.marks = [...this.settled];
    for (const placed of this.placed) {
      if (!('moving' in placed.pin)) continue;
      const head = heads.get(placed.pin.id);
      if (head === undefined) continue;
      const weight = weightAt(head);
      if (weight <= 0) continue;
      const [sx, sy, inside] = screen(head);
      if (!inside) continue;
      const ahead = aheads.get(placed.pin.id);
      let trail: readonly [number, number] = [0.001, 0];
      if (ahead !== undefined && ahead.distanceToSquared(head) > 0) {
        const [ax, ay] = screen(ahead);
        const length = Math.hypot(sx - ax, sy - ay);
        if (length > 0)
          trail = [((sx - ax) / length) * -TRAIL_PX, ((sy - ay) / length) * -TRAIL_PX];
      }
      this.marks.push({
        ...this.markOf({
          sx,
          sy,
          points: [{ placed: { pin: placed.pin, at: head }, sx, sy, weight }],
        }),
        trail,
      });
    }
    if (this.held !== null && this.carried !== null) {
      const [sx, sy, inside] = screen(this.carried);
      const home = this.marks.find((mark) => mark.ids[0] === this.held && mark.ids.length === 1);
      if (inside && home !== undefined)
        this.marks.push({
          ...home,
          ids: [],
          center: this.carried.clone(),
          sx,
          sy,
          ring: RING.none,
          weight: Math.min(1, home.weight / 0.55),
        });
    }
    this.draw();
  }

  /** The topmost mark under a point of the canvas, in CSS pixels, while it holds the pointer. */
  under(x: number, y: number): PinHit | null {
    const slop = this.touch ? 10 : 4;
    for (let k = this.marks.length - 1; k >= 0; k--) {
      const mark = this.marks[k]!;
      // The copy in hand (no ids) is always under the pointer: it is never what one drops on.
      if (mark.weight < TAKES_POINTER || mark.ids.length === 0) continue;
      if (Math.hypot(mark.sx - x, mark.sy - y) > mark.radius + slop) continue;
      return mark.ids.length === 1
        ? { kind: 'pin', id: mark.ids[0]! }
        : { kind: 'cluster', ids: mark.ids };
    }
    return null;
  }

  rectOf(id: string): Rect | null {
    const mark = this.marks.find((each) => each.ids.length === 1 && each.ids[0] === id);
    if (mark === undefined || mark.weight < TAKES_POINTER) return null;
    const r = mark.radius + 2;
    return { left: mark.sx - r, right: mark.sx + r, top: mark.sy - r, bottom: mark.sy + r };
  }

  /** **La nuit, mes épingles prennent un halo de lampe** (#198), et les relevés non. */
  lights(emit: (at: Vector3, radius: number, near: number) => void, unitsPerPixel: number): void {
    for (const mark of this.marks)
      if (mark.mine) emit(mark.center, mark.radius * 1.6 * unitsPerPixel, mark.weight);
  }

  dispose(): void {
    this.shapes.dispose();
    this.glyphs.dispose();
    this.group.removeFromParent();
  }

  private markOf(cluster: Cluster): Mark {
    const pins = cluster.points.map((point) => point.placed.pin);
    const first = pins[0]!;
    const single = pins.length === 1;
    const center = cluster.points
      .reduce((sum, point) => sum.add(point.placed.at!), new Vector3())
      .divideScalar(cluster.points.length);
    const weight = Math.max(...cluster.points.map((point) => point.weight));
    const ids = pins.map((pin) => pin.id);
    const style =
      first.side === 'mine'
        ? STYLE.filled
        : single && first.side === 'lost'
          ? STYLE.dotted
          : STYLE.hollow;
    return {
      ids,
      shape: single ? first.shape : 'pile',
      style,
      ink: inkOf(first),
      center,
      sx: cluster.sx,
      sy: cluster.sy,
      radius: single
        ? first.side === 'mine'
          ? SINGLE_RADIUS[first.shape]
          : first.shape === 'building'
            ? SINGLE_RADIUS.building + 0.5
            : SEEN_RADIUS
        : clusterRadius(pins.length),
      weight: first.id === this.held && single ? weight * 0.55 : weight,
      mine: first.side === 'mine',
      trail: [0, 0],
      ring:
        single && first.id === this.held
          ? RING.held
          : single && first.id === this.hovered
            ? RING.hover
            : RING.none,
      hour: single && first.side === 'lost' ? asClockTime(first.seenAt) : null,
    };
  }

  private draw(): void {
    const shapes = this.shapes.reserve(this.marks.length);
    const glyphCount = this.marks.reduce(
      (sum, mark) =>
        sum +
        (mark.ids.length > 1 ? countText(mark.ids.length).length : 0) +
        (mark.hour?.length ?? 0),
      0,
    );
    const glyphs = this.glyphs.reserve(glyphCount);
    let g = 0;
    this.marks.forEach((mark, k) => {
      color.set(mark.ink);
      shapes.aCenter.set([mark.center.x, mark.center.y, mark.center.z], k * 3);
      shapes.aColor.set([color.r, color.g, color.b], k * 3);
      shapes.aShape.set([SHAPE_INDEX[mark.shape], mark.style, mark.radius, mark.weight], k * 4);
      shapes.aExtra.set([mark.trail[0], mark.trail[1], mark.ring, 0], k * 4);
      const write = (text: string, x: number, size: number, ink: Color, background: number) => {
        const advance = size * GLYPH_ASPECT;
        [...text].forEach((char, i) => {
          glyphs.aCenter.set([mark.center.x, mark.center.y, mark.center.z], g * 3);
          glyphs.aOffset.set([x + i * advance, 0], g * 2);
          glyphs.aGlyph.set(
            [Math.max(0, GLYPHS.indexOf(char)), size, mark.weight, background],
            g * 4,
          );
          glyphs.aColor.set([ink.r, ink.g, ink.b], g * 3);
          g += 1;
        });
      };
      if (mark.ids.length > 1) {
        const text = countText(mark.ids.length);
        const size = mark.radius > 12 ? 10 : 9;
        const ink = mark.style === STYLE.filled ? paper : color;
        write(text, (-(text.length - 1) / 2) * size * GLYPH_ASPECT, size, ink.clone(), 0);
      }
      if (mark.hour !== null) write(mark.hour, mark.radius + 7, 10, pen, 1);
    });
    this.shapes.commit(this.marks.length);
    this.glyphs.commit(g);
  }
}

const scratch = new Vector3();
const color = new Color();
const paper = new Color(PALETTE.paper);
const pen = new Color(PALETTE.border);
const SHAPE_INDEX = { pile: 0, building: 1, outpost: 2 } as const;

function inkOf(pin: Pin): string {
  if (pin.side === 'mine') return pin.ink;
  if (pin.side === 'lost') return ARC_COLORS.lastKnown.trace;
  if (pin.neutral === true) return PALETTE.border;
  return pin.nation === undefined ? ARC_COLORS.enemyDetected.trace : nationInk(pin.nation);
}

/** « 24 », « 519 », « 1,2 k » : a count past a thousand would outgrow its disc. */
export const countText = (count: number): string =>
  count < 1000
    ? String(count)
    : `${(count / 1000).toFixed(1).replace('.', ',').replace(',0', '')} k`;

// --- the two instanced draws ----------------------------------------------------------------

const SHAPE_ATTRIBUTES = { aCenter: 3, aColor: 3, aShape: 4, aExtra: 4 } as const;
const GLYPH_ATTRIBUTES = { aCenter: 3, aColor: 3, aOffset: 2, aGlyph: 4 } as const;

/** One quad, drawn once per instance; its attributes grow by doubling and never shrink. */
class InstancedDraw<A extends Readonly<Record<string, number>>> {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private capacity = 0;
  private arrays = {} as Record<keyof A, Float32Array>;

  constructor(
    private readonly sizes: A,
    material: ShaderMaterial,
  ) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      'corner',
      new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.instanceCount = 0;
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RANK;
    // Picked by `under`, on screen: a ray would aim at the quad and not the pin.
    this.mesh.raycast = () => {};
  }

  reserve(count: number): Record<keyof A, Float32Array> {
    if (count > this.capacity) {
      this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(count)));
      for (const [name, size] of Object.entries(this.sizes)) {
        const array = new Float32Array(this.capacity * size);
        this.arrays[name as keyof A] = array;
        this.mesh.geometry.setAttribute(name, new InstancedBufferAttribute(array, size));
      }
    }
    return this.arrays;
  }

  commit(count: number): void {
    const { geometry } = this.mesh;
    geometry.instanceCount = count;
    this.mesh.visible = count > 0;
    for (const name of Object.keys(this.sizes)) {
      const attribute = geometry.getAttribute(name) as InstancedBufferAttribute | undefined;
      if (attribute === undefined) continue;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.uniforms.uAtlas?.value?.dispose();
    this.mesh.material.dispose();
  }
}

const VIEWPORT = { value: [1, 1] as [number, number] };
/** The canvas size in CSS pixels, which every pin is measured in; set at each resize. */
export function setPinViewport(width: number, height: number): void {
  VIEWPORT.value = [width, height];
}

const PROJECT = /* glsl */ `
  uniform vec2 uViewport;
  vec4 projectPin(vec3 center, vec2 px) {
    vec4 clip = projectionMatrix * viewMatrix * vec4(center, 1.0);
    clip.xy += vec2(px.x, -px.y) * 2.0 / uViewport * clip.w;
    return clip;
  }
`;
const OVER = /* glsl */ `
  vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / max(a, 1e-4), a);
  }
  float fill(float d) { return clamp(0.5 - d, 0.0, 1.0); }
`;

function shapeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uViewport: VIEWPORT,
      uPaper: { value: new Color(PALETTE.paper) },
      uRing: { value: new Color(PALETTE.designated) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec3 aCenter;
      attribute vec3 aColor;
      attribute vec4 aShape;
      attribute vec4 aExtra;
      varying vec2 vPx;
      varying vec3 vColor;
      varying vec4 vShape;
      varying vec4 vExtra;
      ${PROJECT}
      void main() {
        float extent = aShape.z + 14.0 + length(aExtra.xy);
        vPx = corner * extent;
        vColor = aColor;
        vShape = aShape;
        vExtra = aExtra;
        gl_Position = projectPin(aCenter, vPx);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper;
      uniform vec3 uRing;
      varying vec2 vPx;
      varying vec3 vColor;
      varying vec4 vShape;
      varying vec4 vExtra;
      ${OVER}
      float shapeDistance(vec2 p, float shape, float r) {
        if (shape < 0.5) return length(p) - r;
        if (shape < 1.5) { vec2 d = abs(p) - vec2(r); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
        return (abs(p.x) + abs(p.y) - r) * 0.7071;
      }
      void main() {
        vec2 p = vPx;
        float shape = vShape.x, style = vShape.y, r = vShape.z;
        vec4 col = vec4(0.0);
        float trail = length(vExtra.xy);
        if (trail > 0.5) {
          vec2 dir = vExtra.xy / trail;
          float h = clamp(dot(p, dir) / trail, 0.0, 1.0);
          col = over(vec4(vColor, 0.55 * (1.0 - h) * fill(length(p - dir * h * trail) - 2.0)), col);
        }
        float d = shapeDistance(p, shape, r);
        if (style < 0.5) {
          col = over(vec4(uPaper, fill(d - 1.6)), col);
          col = over(vec4(vColor, fill(d)), col);
          if (shape > 1.5) col = over(vec4(uPaper, fill(length(p) - r * 0.3)), col);
        } else {
          col = over(vec4(uPaper, 0.85 * fill(d)), col);
          float stroke = fill(abs(d) - 1.0);
          if (style > 1.5) {
            float n = max(6.0, floor(6.2832 * r / 4.0));
            stroke *= step(fract(atan(p.y, p.x) / 6.2832 * n), 0.45);
          }
          col = over(vec4(vColor, stroke), col);
        }
        float ring = vExtra.z;
        if (ring > 0.5) {
          vec3 ink = ring > 1.5 ? uRing : vColor;
          col = over(vec4(ink, fill(abs(length(p) - r - 5.0) - 0.9)), col);
          if (ring > 1.5) col = over(vec4(ink, 0.5 * fill(abs(length(p) - r - 9.0) - 0.7)), col);
        }
        col.a *= vShape.w;
        if (col.a < 0.004) discard;
        gl_FragColor = col;
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Screen pixels point down and clip space up: the quad turns its back to the eye.
    side: DoubleSide,
  });
}

/** The characters a pin ever writes: a count, an hour. */
const GLYPHS = ' 0123456789:,kh';
const GLYPH_ASPECT = 0.62;
const CELL = 48;

function glyphAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CELL * GLYPH_ASPECT) * GLYPHS.length;
  canvas.height = CELL;
  const texture = new CanvasTexture(canvas);
  const paint = () => {
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `500 ${CELL * 0.8}px "IBM Plex Mono", monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#fff';
    const advance = canvas.width / GLYPHS.length;
    [...GLYPHS].forEach((char, k) => context.fillText(char, (k + 0.5) * advance, CELL * 0.54));
    texture.needsUpdate = true;
  };
  paint();
  // The font may land after the board: the atlas is painted again in it.
  void globalThis.document?.fonts
    ?.load(`500 ${CELL * 0.8}px "IBM Plex Mono"`)
    .then(paint, () => {});
  return texture;
}

function glyphMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uViewport: VIEWPORT,
      uAtlas: { value: glyphAtlas() },
      uPaper: { value: new Color(PALETTE.paper) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec3 aCenter;
      attribute vec3 aColor;
      attribute vec2 aOffset;
      attribute vec4 aGlyph;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec2 vMeta;
      ${PROJECT}
      void main() {
        vec2 size = vec2(aGlyph.y * ${GLYPH_ASPECT.toFixed(2)}, aGlyph.y * 1.3);
        vUv = vec2((aGlyph.x + corner.x * 0.5 + 0.5) / ${GLYPHS.length.toFixed(1)}, 0.5 - corner.y * 0.5);
        vColor = aColor;
        vMeta = aGlyph.zw;
        gl_Position = projectPin(aCenter, aOffset + corner * size * 0.5);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uPaper;
      varying vec2 vUv;
      varying vec3 vColor;
      varying vec2 vMeta;
      ${OVER}
      void main() {
        vec4 col = over(vec4(vColor, texture2D(uAtlas, vUv).a), vec4(uPaper, 0.82 * vMeta.y));
        col.a *= vMeta.x;
        if (col.a < 0.004) discard;
        gl_FragColor = col;
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Screen pixels point down and clip space up: the quad turns its back to the eye.
    side: DoubleSide,
  });
}
