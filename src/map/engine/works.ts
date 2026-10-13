import {
  type Box3,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  PlaneGeometry,
  type Quaternion,
  type Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { riseOf } from '@/domain/construction';
import type { StampWords } from '@/domain/ink-bursts';
import { footprintOf, type Loop } from './footprint';
import { ARC_COLORS, PALETTE } from './palette';

/**
 * **A site at work, as the board stands it** (mode chantier): paid and waiting its turn — its
 * plan dashed on the ground, no volume —, its first level rising — cut where the work has
 * reached, hatched at the cut, scaffolded in ink up to it, a stake and its pennant at its foot —,
 * or a standing building raised a level — whole, scaffolded to its very top, its pennant reading
 * the level that goes up.
 */
export type Works = {
  readonly phase: 'queued' | 'rising' | 'raising';
  /** The level it will stand at: a raise that follows another is a new site, not the same. */
  readonly level: number;
  /** Only the head of the queue is dated. */
  readonly finishesAt: number | null;
  readonly minutes: number;
  /** What the pennant reads, `null` for a bare one. */
  readonly pennant: string | null;
  /** Pressed when it stands under the player's eyes. */
  readonly stamp: StampWords | null;
};

/** The pennant's cloth: the ochre of what I pilot (`--arc-mine`) — a site's colour, not an alarm. */
const OCHRE = ARC_COLORS.mine.trace;
const INK = PALETTE.border;

/**
 * **What a model stands on**: the outline from above of whatever reaches its lower quarter —
 * walls, plinths, a yard —, so a roof's eaves do not swell the plan. Once per model.
 */
const footprints = new WeakMap<Box3, Loop[]>();
export function groundFootprint(
  geometries: ReadonlyArray<BufferGeometry>,
  box: Box3,
): ReadonlyArray<Loop> {
  const known = footprints.get(box);
  if (known !== undefined) return known;
  const low = box.min.y + (box.max.y - box.min.y) * 0.25;
  const flat: number[] = [];
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const count = index === null ? position.count : index.count;
    for (let k = 0; k + 2 < count; k += 3) {
      const corners = [k, k + 1, k + 2].map((c) => (index === null ? c : index.getX(c)));
      if (!corners.some((c) => position.getY(c) < low)) continue;
      for (const c of corners) flat.push(position.getX(c), position.getZ(c));
    }
  }
  const loops = footprintOf(flat);
  footprints.set(box, loops);
  return loops;
}

const signedArea = (loop: Loop): number =>
  loop.reduce((sum, [x, z], k) => {
    const [nx, nz] = loop[(k + 1) % loop.length]!;
    return sum + x * nz - nx * z;
  }, 0) / 2;

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
};

const textureOf = (canvas: HTMLCanvasElement): CanvasTexture => {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

/** The architect's plan: the outline dashed in ink over a pencil wash, and two dimension lines
 *  with no figure — a maquette is not to scale, and a metre written here would be invented. */
function planTexture(loops: ReadonlyArray<Loop>, x0: number, z0: number, size: number) {
  const { canvas, ctx } = canvasOf(512, 512);
  const px = (x: number) => ((x - x0) / size) * 512;
  const pz = (z: number) => ((z - z0) / size) * 512;
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const loop of loops)
    loop.forEach(([x, z], k) => (k === 0 ? ctx.moveTo(px(x), pz(z)) : ctx.lineTo(px(x), pz(z))));
  ctx.closePath();
  ctx.globalAlpha = 0.07;
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  ctx.setLineDash([16, 10]);
  for (const loop of loops) {
    ctx.beginPath();
    loop.forEach(([x, z], k) => (k === 0 ? ctx.moveTo(px(x), pz(z)) : ctx.lineTo(px(x), pz(z))));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const xs = loops.flatMap((loop) => loop.map(([x]) => px(x)));
  const zs = loops.flatMap((loop) => loop.map(([, z]) => pz(z)));
  const [xa, xb, za, zb] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const off = 34;
  ctx.lineWidth = 2;
  const tick = (x: number, y: number) => {
    ctx.moveTo(x - 7, y + 7);
    ctx.lineTo(x + 7, y - 7);
  };
  ctx.beginPath();
  ctx.moveTo(xa, zb + off);
  ctx.lineTo(xb, zb + off);
  ctx.moveTo(xa, zb + 8);
  ctx.lineTo(xa, zb + off + 10);
  ctx.moveTo(xb, zb + 8);
  ctx.lineTo(xb, zb + off + 10);
  tick(xa, zb + off);
  tick(xb, zb + off);
  ctx.moveTo(xb + off, za);
  ctx.lineTo(xb + off, zb);
  ctx.moveTo(xb + 8, za);
  ctx.lineTo(xb + off + 10, za);
  ctx.moveTo(xb + 8, zb);
  ctx.lineTo(xb + off + 10, zb);
  tick(xb + off, za);
  tick(xb + off, zb);
  ctx.stroke();
  return textureOf(canvas);
}

let hatch: MeshBasicMaterial | null = null;
/** The section's hatching, the engraver's diagonal, over the paper. */
function hatchMaterial(): MeshBasicMaterial {
  if (hatch !== null) return hatch;
  const { canvas, ctx } = canvasOf(128, 128);
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (let k = -128; k < 256; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 128);
    ctx.lineTo(k + 128, 0);
    ctx.stroke();
  }
  const map = textureOf(canvas);
  map.wrapS = map.wrapT = RepeatWrapping;
  hatch = new MeshBasicMaterial({ map, side: DoubleSide, toneMapped: false });
  return hatch;
}

const flags = new Map<string, MeshStandardMaterial>();
/** The pennant: ochre cloth, swallow-tailed, inked round, and the level that goes up. */
function flagMaterial(text: string | null): MeshStandardMaterial {
  const known = flags.get(text ?? '');
  if (known !== undefined) return known;
  const { canvas, ctx } = canvasOf(256, 160);
  ctx.fillStyle = OCHRE;
  ctx.beginPath();
  ctx.moveTo(3, 3);
  ctx.lineTo(253, 3);
  ctx.lineTo(208, 80);
  ctx.lineTo(253, 157);
  ctx.lineTo(3, 157);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();
  if (text !== null) {
    ctx.fillStyle = INK;
    ctx.font = 'italic 700 62px "Bodoni Moda", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 108, 84);
  }
  // Cut out, not blended: a transparent cloth would cast no shadow (`castShadows`).
  const material = new MeshStandardMaterial({
    map: textureOf(canvas),
    side: DoubleSide,
    alphaTest: 0.5,
    roughness: 0.8,
  });
  flags.set(text ?? '', material);
  return material;
}

const POLE = new CylinderGeometry(0.8, 1, 1, 8).translate(0, 0.5, 0);
const WOOD = new MeshStandardMaterial({ color: PALETTE.worldRim, roughness: 0.6 });
const SCAFFOLD_INK = new LineBasicMaterial({ color: INK });
const scale = new Vector3();

/**
 * Posts every bay, a ledger every lift, a brace across each bay — the prototype's scaffold, as
 * lines of ink rather than lit bars. Around the box a little wide, from the ground to `height`.
 */
function scaffoldPositions(box: Box3, span: number, height: number): number[] {
  const pad = span * 0.056;
  const [x0, x1, z0, z1] = [box.min.x - pad, box.max.x + pad, box.min.z - pad, box.max.z + pad];
  const lifts = Math.max(2, Math.round(height / (span * 0.13)));
  const step = height / lifts;
  const out: number[] = [];
  const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) =>
    out.push(ax, ay, az, bx, by, bz);
  const faces = [
    [x0, z1, x1, z1],
    [x1, z1, x1, z0],
    [x1, z0, x0, z0],
    [x0, z0, x0, z1],
  ] as const;
  for (const [ax, az, bx, bz] of faces) {
    const bays = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / (span * 0.2)));
    const at = (t: number) => [ax + (bx - ax) * t, az + (bz - az) * t] as const;
    for (let i = 0; i <= bays; i++) {
      const [x, z] = at(i / bays);
      line(x, 0, z, x, height + span * 0.03, z);
    }
    for (let j = 1; j <= lifts; j++) line(ax, j * step, az, bx, j * step, bz);
    for (let i = 0; i < bays; i++) {
      const [[px, pz], [qx, qz]] = [at(i / bays), at((i + 1) / bays)];
      const [j, flip] = [i % lifts, i % 2];
      line(px, (j + flip) * step, pz, qx, (j + 1 - flip) * step, qz);
    }
  }
  return out;
}

/**
 * **The dressing of one site at work**, in its model's units: the caller places it as it places
 * the maquette (`place`), and the lot cuts its materials by `cut` while its first level rises.
 */
export class WorksDressing {
  readonly object = new Group();
  /** The plane a rising site is cut at; `null` when nothing is cut. */
  readonly cut: Plane | null;
  private readonly span: number;
  private scaffold: LineSegments | null = null;
  private scaffoldHeight = -1;
  private readonly cap: Mesh | null = null;
  private readonly stake: Group | null = null;
  private readonly plan: Mesh | null = null;

  constructor(
    readonly works: Works,
    private readonly box: Box3,
    footprint: ReadonlyArray<Loop>,
  ) {
    this.object.matrixAutoUpdate = false;
    this.span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    this.cut = works.phase === 'rising' ? new Plane(new Vector3(0, -1, 0), 0) : null;
    if (works.phase === 'queued') {
      const size = this.span * 1.6;
      const [cx, cz] = [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2];
      this.plan = new Mesh(
        new PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({
          map: planTexture(footprint, cx - size / 2, cz - size / 2, size),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      );
      this.plan.position.set(cx, this.span * 0.004, cz);
      this.object.add(this.plan);
      return;
    }
    this.stake = new Group();
    const pole = new Mesh(POLE, WOOD);
    pole.scale.set(this.span * 0.012, this.span * 0.45, this.span * 0.012);
    const width = this.span * (works.pennant === null ? 0.17 : 0.26);
    const flag = new Mesh(new PlaneGeometry(width, width * 0.625), flagMaterial(works.pennant));
    flag.position.set(width / 2, this.span * 0.45 - width * 0.3125, 0);
    this.stake.add(pole, flag);
    this.stake.position.set(box.max.x + this.span * 0.13, 0, box.max.z + this.span * 0.09);
    this.object.add(this.stake);
    if (this.cut !== null) {
      const outer = footprint.filter((loop) => signedArea(loop) > 0);
      const geometry = new ShapeGeometry(
        outer.map((loop) => new Shape(loop.map(([x, z]) => new Vector2(x, -z)))),
      ).rotateX(-Math.PI / 2);
      const uv = geometry.getAttribute('uv');
      // About a dozen strokes across the widest side.
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, (uv.getX(k) * 4) / this.span, (uv.getY(k) * 4) / this.span);
      this.cap = new Mesh(geometry, hatchMaterial());
      this.object.add(this.cap);
    }
  }

  /** Placed as its maquette: `size` takes model units to the board's. A rising site is read
   *  off the clock — slow, the board's heartbeat moves it enough. */
  place(at: Vector3, turn: Quaternion, size: number, now: number): void {
    this.object.visible = size > 0;
    if (size <= 0) return;
    this.object.matrix.compose(at, turn, scale.setScalar(size));
    const share =
      this.cut === null || this.works.finishesAt === null
        ? 1
        : riseOf((this.works.finishesAt - now) / 60_000, this.works.minutes);
    if (this.works.phase === 'queued') return;
    const height = this.cut === null ? this.box.max.y : this.box.max.y * share;
    if (this.cut !== null) {
      this.cut.constant = at.y + height * size;
      this.cap!.position.y = height;
      this.cap!.visible = share < 1;
      this.stake!.visible = share < 1;
    }
    this.scaffoldTo(Math.max(height, this.span * 0.05), share < 1 || this.cut === null);
  }

  private scaffoldTo(height: number, shown: boolean): void {
    if (Math.abs(height - this.scaffoldHeight) > this.box.max.y * 0.01) {
      this.scaffoldHeight = height;
      this.scaffold?.removeFromParent();
      this.scaffold?.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(scaffoldPositions(this.box, this.span, height), 3),
      );
      this.scaffold = new LineSegments(geometry, SCAFFOLD_INK);
      this.object.add(this.scaffold);
    }
    this.scaffold!.visible = shown;
  }

  /** The plan is taken by the pointer over the ground it marks, as a maquette by its walls —
   *  not over the margin its sheet keeps for the dimension lines, which a neighbour may need. */
  pick(ray: Raycaster): number | null {
    if (this.plan === null || !this.object.visible) return null;
    const hit = ray.intersectObject(this.plan, false)[0];
    if (hit === undefined) return null;
    const local = this.object.worldToLocal(hit.point.clone());
    const { min, max } = this.box;
    return local.x >= min.x && local.x <= max.x && local.z >= min.z && local.z <= max.z
      ? hit.distance
      : null;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.scaffold?.geometry.dispose();
    this.cap?.geometry.dispose();
    if (this.plan !== null) {
      this.plan.geometry.dispose();
      const material = this.plan.material as MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    }
    for (const child of this.stake?.children ?? [])
      if (child !== this.stake?.children[0]) (child as Mesh).geometry.dispose();
  }
}
