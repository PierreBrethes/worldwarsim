import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  type Raycaster,
  Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { MAST_PX, MAST_UNITS, mastPx, type Mast } from '@/domain/strategic-mast';
import { RING_RADIUS } from './annotations';
import type { AmbientLayer } from './ambience';
import { faceCamera } from './billboard';
import { ANONYMOUS_SPAN, troopScale } from './figurines/figurine';
import type { WorldFrame } from './frame';
import { lonLatAround } from './reach';
import { leastHit, LEAST_TARGET_PX, LEAST_TOUCH_PX, nearer, type PieceHit } from './piece-pick';
import { LIVE_PX } from './site-loops';

/** The ten of the pool, room to spare: a Mondiale stands seven. */
const CAPACITY = 16;
/** Above the halos (2,5) and the beams (2,6), under the rings and the threads (3 and up). */
const RANK = 3;
const LIFT = 0.01;
/** The pen the mast and its socle are drawn in (the contours' `PALETTE.border`). */
const PEN = '#2a2118';
/** How far the night raises an ink, as the contours do (`contours.ts`): a share toward the moon's blue. */
const NIGHT_LIFT = 0.8;

/** @a-mesurer lavis.html (cap #668): the shaft, the pomme, the star of mine, in board units */
const SHAFT = 0.012;
const POMME = 0.024;
const STAR = 0.05;
/** @a-mesurer lavis.html (cap #668): the pennant's length, and the width of its liseré */
const FLAME_LENGTH = 0.26;
const FRINGE = 0.012;
/** @a-mesurer lavis.html (cap #668): how far the ring stands off the socle, in socle radii */
const RING_OF_BASE = 1.6;
const RING_DASHES = 14;
const RING_WIDTH = 0.12;
/** Seconds per turn of the ring, and how far the pennant swings, at full motion. @a-mesurer */
const RING_TURN = 0.08;
const SWAY = 0.13;
const SWAY_PACE = 2.4;

/** A point whose mast stands: the marker's id (what a click answers to), its place, what it shows. */
export type MastPoint = {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly mast: Mast;
};

/** The inked share of the mast the screen is asked for: board units per pixel and the mast's scale. */
export function mastScale(px: number, unitsPerPixel: number): number {
  return (px * unitsPerPixel) / MAST_UNITS.height;
}

/**
 * The socle's radius in board units: its own, but never under `baseMinShare` of the mast as drawn,
 * for the floor grows the mast without growing a point.
 */
export function baseRadiusOf(scale: number): number {
  return Math.max(MAST_UNITS.baseRadius, MAST_PX.baseMinShare * MAST_UNITS.height * scale);
}

/** Night raises an ink toward a pale blue, as a contour does: `mix(ink, ink * 0.55 + blue, night)`. */
export function nightInk(ink: Color, night: number, into: Color): Color {
  const share = night * NIGHT_LIFT;
  return into.setRGB(
    ink.r + (ink.r * 0.55 + 0.2 - ink.r) * share,
    ink.g + (ink.g * 0.55 + 0.23 - ink.g) * share,
    ink.b + (ink.b * 0.55 + 0.34 - ink.b) * share,
  );
}

/** The pennant, mast on the left, top edge at 0 and hanging down: a swallowtail. */
const PENNANT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, -MAST_UNITS.flame],
  [FLAME_LENGTH, -MAST_UNITS.flame],
  [FLAME_LENGTH * 0.78, -MAST_UNITS.flame / 2],
  [FLAME_LENGTH, 0],
];
const PENNANT_TRIANGLES = [0, 1, 3, 0, 3, 4, 1, 2, 3];

/** A counter-clockwise polygon pushed outward by `width`, corner by corner. */
function grown(
  points: ReadonlyArray<readonly [number, number]>,
  width: number,
): Array<[number, number]> {
  return points.map(([x, y], k) => {
    const [px, py] = points[(k + points.length - 1) % points.length]!;
    const [nx, ny] = points[(k + 1) % points.length]!;
    const outward = (ax: number, ay: number, bx: number, by: number): [number, number] => {
      const length = Math.hypot(bx - ax, by - ay);
      return [(by - ay) / length, -(bx - ax) / length];
    };
    const [ax, ay] = outward(px, py, x, y);
    const [bx, by] = outward(x, y, nx, ny);
    const mx = ax + bx;
    const my = ay + by;
    const length = Math.hypot(mx, my);
    const along = (mx * ax + my * ay) / length / length;
    return [x + mx * along * width, y + my * along * width];
  });
}

function flat(positions: number[], index: number[], extra?: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  if (extra) geometry.setAttribute('aPart', new Float32BufferAttribute(extra, 1));
  return geometry;
}

/** The shaft and its pomme, and (part 1) the star of a point of mine, over the pomme. */
function mastGeometry(): BufferGeometry {
  const height = MAST_UNITS.height;
  const positions = [
    -SHAFT / 2,
    0,
    0,
    SHAFT / 2,
    0,
    0,
    SHAFT / 2,
    height,
    0,
    -SHAFT / 2,
    height,
    0,
  ];
  const index = [0, 1, 2, 0, 2, 3];
  const parts = [0, 0, 0, 0];
  const disc = (cx: number, cy: number, radius: number, steps: number, part: number): void => {
    const first = positions.length / 3;
    positions.push(cx, cy, 0);
    parts.push(part);
    for (let step = 0; step < steps; step++) {
      const a = (2 * Math.PI * step) / steps;
      positions.push(cx + radius * Math.sin(a), cy + radius * Math.cos(a), 0);
      parts.push(part);
    }
    for (let step = 0; step < steps; step++)
      index.push(first, first + 1 + step, first + 1 + ((step + 1) % steps));
  };
  disc(0, height + POMME * 0.6, POMME, 12, 0);
  // The star: ten points on two radii, a fan.
  const centre = positions.length / 3;
  const top = height + POMME * 1.6 + STAR;
  positions.push(0, top, 0);
  parts.push(1);
  for (let k = 0; k < 10; k++) {
    const a = (Math.PI * k) / 5;
    const r = k % 2 === 0 ? STAR : STAR * 0.4;
    positions.push(r * Math.sin(a), top + r * Math.cos(a), 0);
    parts.push(1);
  }
  for (let k = 0; k < 10; k++) index.push(centre, centre + 1 + k, centre + 1 + ((k + 1) % 10));
  return flat(positions, index, parts);
}

function pennant(points: ReadonlyArray<readonly [number, number]>): BufferGeometry {
  return flat(
    points.flatMap(([x, y]) => [x, y, 0]),
    PENNANT_TRIANGLES,
  );
}

/** A disc of radius 1 on the ground. */
function socle(): BufferGeometry {
  const steps = 24;
  const positions = [0, 0, 0];
  const index: number[] = [];
  for (let step = 0; step < steps; step++) {
    const a = (2 * Math.PI * step) / steps;
    positions.push(Math.sin(a), 0, Math.cos(a));
    index.push(0, 1 + step, 1 + ((step + 1) % steps));
  }
  return flat(positions, index);
}

/** A dashed ring of radius 1 on the ground: `RING_DASHES` arcs, a half of each turn. */
function dashedRing(): BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const arcSteps = 3;
  for (let dash = 0; dash < RING_DASHES; dash++) {
    const from = (2 * Math.PI * dash) / RING_DASHES;
    const span = (2 * Math.PI) / RING_DASHES / 2;
    const base = positions.length / 3;
    for (let step = 0; step <= arcSteps; step++) {
      const a = from + (span * step) / arcSteps;
      positions.push(Math.sin(a), 0, Math.cos(a));
      positions.push((1 - RING_WIDTH) * Math.sin(a), 0, (1 - RING_WIDTH) * Math.cos(a));
    }
    for (let step = 0; step < arcSteps; step++) {
      const k = base + step * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  return flat(positions, index);
}

function material(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    // Flat, never lit: the inks are set per instance, and by night raised on the CPU.
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

/** The star rides on the mast's one draw: a part of the geometry an instance may collapse. */
function starred(mat: MeshBasicMaterial): MeshBasicMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aPart;\nattribute float aStar;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed *= (aPart > 0.5 && aStar < 0.5) ? 0.0 : 1.0;',
      );
  };
  mat.customProgramCacheKey = () => 'strategic-mast-star';
  return mat;
}

function instanced(
  geometry: BufferGeometry,
  mat: MeshBasicMaterial,
  rank: number,
): InstancedMesh<BufferGeometry, MeshBasicMaterial> {
  const mesh = new InstancedMesh(geometry, mat, CAPACITY);
  mesh.renderOrder = rank;
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.setColorAt(0, new Color(1, 1, 1));
  // Decor: neither picked nor aimed at (`under` answers for it).
  mesh.raycast = () => {};
  return mesh;
}

type Placed = {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly at: Vector3;
  /** Where a step of the mast to the north lies on the board, unit length. */
  readonly north: Vector3;
  readonly ring: boolean;
  readonly star: boolean;
  /** **What #682 drives**: the flame's height (share of the mast) and its ink, set again by each `show`. */
  flameAt: number;
  ink: Color;
  /** Where it stands and how big as last drawn: what a click and the idle check read. */
  foot: Vector3;
  height: number;
  readonly box: Box3;
};

const object = new Object3D();
const local = new Matrix4();
const scratch = new Matrix4();
const paint = new Color();
const pen = new Color(PEN);
const UP = new Vector3(0, 1, 0);
const middle = new Vector3();
const cube = new Vector3();
const spot = new Vector3();

/**
 * **A mast with its pennant at each strategic point** (#677): an ambience of the fx `sites`, in
 * instanced flat meshes (five draws for all the points, no shadow): the mast with its pomme and the
 * star of mine, the pennant, its liseré, the socle and, contested, a dashed ring. It stands
 * upright to the eye on its foot (`billboard.ts`), to the north of the point so that a garrison
 * stays in front of it, at the size `mastPx` asks for. The mast says nothing of a garrison
 * (ADR 0043 §5): it is drawn for every point, seen or not.
 *
 * At full motion the pennant sways and the ring turns, one frame per ambience step; at reduced and
 * cut motion the pennant is at rest and the ring stays, still. Idle when no mast is in the field
 * and big enough to read. The night lifts the inks as a contour's and lights the socle by `lights`.
 */
export class StrategicMasts implements AmbientLayer {
  readonly fx = 'sites';
  readonly hz = 8;
  readonly object = new Group();
  private readonly geometries: BufferGeometry[];
  private readonly mast: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  private readonly flame: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  private readonly fringe: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  private readonly socle: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  private readonly ring: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  private readonly starAttribute = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
  private points: ReadonlyArray<Placed> = [];
  private clock = 0;
  private moving = false;

  constructor(
    private readonly board: Pick<WorldFrame, 'projectLonLat'>,
    /** Whether the box is in the eye's field and at least `px` on screen. */
    private readonly sees: (box: Box3, px: number) => boolean,
    private readonly touch: boolean,
  ) {
    const outline = PENNANT as ReadonlyArray<readonly [number, number]>;
    this.geometries = [
      mastGeometry(),
      pennant(outline),
      pennant(grown(outline, FRINGE)),
      socle(),
      dashedRing(),
    ];
    const [mastShape, flameShape, fringeShape, socleShape, ringShape] = this.geometries as [
      BufferGeometry,
      BufferGeometry,
      BufferGeometry,
      BufferGeometry,
      BufferGeometry,
    ];
    mastShape.setAttribute('aStar', this.starAttribute);
    this.socle = instanced(socleShape, material(), RANK);
    this.ring = instanced(ringShape, material(), RANK + 0.05);
    this.mast = instanced(mastShape, starred(material()), RANK + 0.1);
    this.fringe = instanced(fringeShape, material(), RANK + 0.15);
    this.flame = instanced(flameShape, material(), RANK + 0.2);
    this.object.add(this.socle, this.ring, this.mast, this.fringe, this.flame);
    this.object.visible = false;
  }

  /** Every point's mast, at each view: the flame and the ink are read again from `mast`. */
  show(points: ReadonlyArray<MastPoint>): void {
    this.points = points.slice(0, CAPACITY).map((point) => {
      const at = this.board.projectLonLat(point.lonLat);
      const km = this.board.projectLonLat(lonLatAround(point.lonLat, 1, 0));
      const north = new Vector3(km.x - at.x, 0, km.z - at.z).normalize();
      return {
        id: point.id,
        lonLat: point.lonLat,
        at,
        north,
        ring: point.mast.ring,
        star: point.mast.star,
        flameAt: point.mast.flameAt,
        ink: new Color(point.mast.ink),
        foot: at.clone(),
        height: MAST_UNITS.height,
        box: new Box3().setFromCenterAndSize(
          at,
          new Vector3(1, 1, 1).multiplyScalar(MAST_UNITS.height),
        ),
      };
    });
  }

  idle(): boolean {
    return !this.points.some((point) => this.sees(point.box, LIVE_PX));
  }

  frame(time: number, motion: MapMotion): void {
    this.moving = motion === 'full';
    this.clock = this.moving ? time : 0;
  }

  /**
   * Stands every mast for this image: at the size the screen asks, upright to the eye on its foot.
   * `distance` is the orbit's, `screenHeight` and `fov` the camera's own (`mastPx`).
   */
  orient(eye: Vector3, distance: number, screenHeight: number, fov: number, night: number): void {
    const { points } = this;
    this.object.visible = points.length > 0;
    if (points.length === 0) return;
    const unitsPerPixel = (2 * Math.tan((fov * Math.PI) / 360) * distance) / screenHeight;
    const scale = mastScale(mastPx(distance, this.touch, screenHeight, fov), unitsPerPixel);
    const baseRadius = baseRadiusOf(scale);
    let rings = 0;
    points.forEach((point, k) => {
      // Past the socle and past the ring a camp wears, so that a garrison stays in front.
      const camp =
        RING_RADIUS * troopScale(point.at.distanceTo(eye), ANONYMOUS_SPAN, ANONYMOUS_SPAN);
      const off = baseRadius + camp;
      point.foot.set(
        point.at.x + point.north.x * off,
        point.at.y + LIFT,
        point.at.z + point.north.z * off,
      );
      point.height = MAST_UNITS.height * scale;
      point.box.setFromCenterAndSize(
        middle.copy(point.foot).addScaledVector(UP, point.height / 2),
        cube.setScalar(point.height),
      );

      object.position.copy(point.foot);
      faceCamera(object, eye);
      object.scale.setScalar(scale);
      object.updateMatrix();
      this.mast.setMatrixAt(k, object.matrix);
      this.starAttribute.setX(k, point.star ? 1 : 0);

      // The pennant hangs from `flameAt` of the mast, swaying about where it is fixed.
      const sway = this.moving ? Math.sin(this.clock * SWAY_PACE + k) * SWAY : 0;
      local.makeTranslation(0, point.flameAt * MAST_UNITS.height, 0);
      local.multiply(scratch.makeRotationZ(sway));
      scratch.multiplyMatrices(object.matrix, local);
      this.flame.setMatrixAt(k, scratch);
      this.fringe.setMatrixAt(k, scratch);

      this.flame.setColorAt(k, nightInk(point.ink, night, paint));
      this.fringe.setColorAt(k, nightInk(pen, night, paint));
      this.mast.setColorAt(k, nightInk(pen, night, paint));
      this.socle.setColorAt(k, nightInk(pen, night, paint));

      object.position.copy(point.foot);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(baseRadius);
      object.updateMatrix();
      this.socle.setMatrixAt(k, object.matrix);

      if (point.ring) {
        object.rotation.set(0, this.moving ? this.clock * RING_TURN * 2 * Math.PI : 0, 0);
        object.scale.setScalar(baseRadius * RING_OF_BASE);
        object.updateMatrix();
        this.ring.setMatrixAt(rings, object.matrix);
        this.ring.setColorAt(rings, nightInk(pen, night, paint));
        rings += 1;
      }
    });
    this.mast.count = this.flame.count = this.fringe.count = this.socle.count = points.length;
    this.ring.count = rings;
    for (const mesh of [this.mast, this.flame, this.fringe, this.socle, this.ring]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.starAttribute.needsUpdate = true;
  }

  /** **The mast under the pointer**: its marker's id, taken within the least target of its foot, its
   *  middle or its head. Nothing for a mast out of the field. */
  under(ray: Raycaster): PieceHit | null {
    const width = this.touch ? LEAST_TOUCH_PX : LEAST_TARGET_PX;
    let best: PieceHit | null = null;
    for (const point of this.points) {
      if (!this.sees(point.box, 0)) continue;
      let distance: number | null = null;
      for (const share of [0, 0.5, 1]) {
        const hit = leastHit(
          ray,
          spot.copy(point.foot).addScaledVector(UP, point.height * share),
          width,
        );
        if (hit !== null && (distance === null || hit < distance)) distance = hit;
      }
      if (distance !== null) best = nearer(best, { id: point.id, distance });
    }
    return best;
  }

  /**
   * **Where the head of a mast stands** (its pomme, or the star of a point of mine over it), for the
   * cartouche to hang from (#683). `null` for an id with no mast. Read after `orient`.
   */
  headOf(id: string): Vector3 | null {
    const point = this.points.find((candidate) => candidate.id === id);
    if (point === undefined) return null;
    const over = POMME * 1.6 + (point.star ? 2 * STAR : 0);
    const scale = point.height / MAST_UNITS.height;
    return spot.copy(point.foot).addScaledVector(UP, point.height + over * scale);
  }

  /** The socle's lamp by night, as a piece's: its centre, its radius, a whole share of light. */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    for (const point of this.points)
      emit(point.foot, baseRadiusOf(point.height / MAST_UNITS.height), 1);
  }

  /** How many masts stand: what the tests read. */
  get size(): number {
    return this.points.length;
  }

  dispose(): void {
    for (const mesh of [this.mast, this.flame, this.fringe, this.socle, this.ring]) {
      mesh.material.dispose();
      mesh.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.object.removeFromParent();
  }
}
