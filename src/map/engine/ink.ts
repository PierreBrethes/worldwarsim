import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { LonLat } from '@/domain/geo';
import type { InkBurst } from '@/domain/ink-bursts';
import type { MapMotion } from '@/domain/map-motion';
import type { WorldFrame } from './frame';
import { ARC_COLORS, PALETTE } from './palette';
import type { ThreadLeg } from './thread';

export const TRACE_MS = 800;
const TRACE_RANK = 12.4;
const TRACE_PX = 2.5;

const BURST_RANK = 13.5;
const IMPRINT_MS = 300;
const LIFE_MS = 2600;
const PEAK_OPACITY = 0.8;
const STAMP_PX = 16;
const SPLASH_PX = 14;

/** A pen accelerates, then slows down to lift: ease in-out, never linear. */
export const penEase = (share: number): number =>
  share < 0.5 ? 4 * share ** 3 : 1 - (-2 * share + 2) ** 3 / 2;

/** The polylines up to a share of their total length, the last one cut mid-segment. */
export function inkedStrands(
  strands: ReadonlyArray<ReadonlyArray<Vector3>>,
  share: number,
): ReadonlyArray<ReadonlyArray<Vector3>> {
  const lengthOf = (line: ReadonlyArray<Vector3>) =>
    line.slice(1).reduce((sum, point, i) => sum + point.distanceTo(line[i]!), 0);
  let left = share * strands.reduce((sum, line) => sum + lengthOf(line), 0);
  const inked: Vector3[][] = [];
  for (const line of strands) {
    const part: Vector3[] = [];
    for (let i = 0; i < line.length && left > 0; i++) {
      if (i === 0) {
        part.push(line[0]!);
        continue;
      }
      const step = line[i]!.distanceTo(line[i - 1]!);
      part.push(left >= step ? line[i]! : line[i - 1]!.clone().lerp(line[i]!, left / step));
      left -= step;
    }
    if (part.length > 1) inked.push(part);
  }
  return inked;
}

type Trace = {
  readonly strands: ReadonlyArray<ReadonlyArray<Vector3>>;
  readonly start: number;
  lines: Line2[];
};
type Stamp = {
  readonly mesh: Mesh<ShapeGeometry, MeshBasicMaterial>;
  readonly start: number;
};

const disc = (x: number, y: number, radius: number): Shape =>
  new Shape().absarc(x, y, radius, 0, Math.PI * 2, false);

/** A round stamp: a ring and a core, the seal of something that arrived. */
function stampShapes(): Shape[] {
  const ring = disc(0, 0, 1);
  ring.holes.push(new Path().absarc(0, 0, 0.72, 0, Math.PI * 2, true));
  return [ring, disc(0, 0, 0.4)];
}

/** A jagged splash with droplets thrown off it: no round edge, so it cannot pass for a stamp. */
function splashShapes(): Shape[] {
  const radii = [1, 0.55, 0.85, 0.5, 1.05, 0.6, 0.8, 0.45, 0.95, 0.55, 0.75, 0.5];
  const blot = new Shape();
  radii.forEach((radius, i) => {
    const angle = (i / radii.length) * Math.PI * 2;
    if (i === 0) blot.moveTo(radius, 0);
    else blot.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const drops = [0.5, 2.1, 3.4, 5.0].map((angle, i) =>
    disc(Math.cos(angle) * 1.4, Math.sin(angle) * 1.4, 0.12 + i * 0.03),
  );
  return [blot, ...drops];
}

/**
 * The ink on the board: a pen stroke that traces a sent movement, and the stamp or splash that
 * marks an arrival or a combat. Both are moments, not ambience: they run at full rate while they
 * last (`active`) and the engine keeps rendering for them.
 */
export class InkLayer {
  readonly group = new Group();
  motion: MapMotion = 'full';
  private traces: Trace[] = [];
  private stamps: Stamp[] = [];
  private width = 1;
  private height = 1;
  private readonly geometries = {
    arrival: new ShapeGeometry(stampShapes()),
    combat: new ShapeGeometry(splashShapes()),
  };

  constructor(
    private readonly frame: WorldFrame,
    private readonly enabled: boolean,
  ) {}

  get active(): boolean {
    return this.traces.length + this.stamps.length > 0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Returns how long the pen takes, `0` when the thread should simply be there. */
  trace(legs: ReadonlyArray<ThreadLeg>, now: number): number {
    if (!this.enabled || this.motion !== 'full') return 0;
    const strands = legs.flatMap((leg) => leg.strands.map((strand) => strand.vertices));
    this.traces.push({ strands, start: now, lines: [] });
    return TRACE_MS;
  }

  burst({ kind, at }: InkBurst, now: number): void {
    if (!this.enabled || this.motion === 'off') return;
    const ink = kind === 'combat' ? ARC_COLORS.enemyDetected.trace : PALETTE.border;
    const mesh = new Mesh(
      this.geometries[kind],
      new MeshBasicMaterial({
        color: ink,
        transparent: true,
        opacity: 0,
        depthTest: false,
        side: DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = BURST_RANK;
    mesh.position.copy(this.frame.projectLonLat(at as LonLat));
    this.group.add(mesh);
    this.stamps.push({ mesh, start: now });
  }

  animate(now: number, unitsPerPixel: number): void {
    this.traces = this.traces.filter((trace) => this.draw(trace, now));
    this.stamps = this.stamps.filter((stamp) => this.age(stamp, now, unitsPerPixel));
  }

  dispose(): void {
    for (const trace of this.traces) this.wipe(trace);
    for (const stamp of this.stamps) stamp.mesh.material.dispose();
    this.traces = [];
    this.stamps = [];
    this.geometries.arrival.dispose();
    this.geometries.combat.dispose();
    this.group.removeFromParent();
  }

  private draw(trace: Trace, now: number): boolean {
    const elapsed = (now - trace.start) / TRACE_MS;
    this.wipe(trace);
    if (elapsed >= 1) return false;
    trace.lines = inkedStrands(trace.strands, penEase(Math.max(0, elapsed))).map((strand) => {
      const geometry = new LineGeometry();
      geometry.setPositions(strand.flatMap((point) => [point.x, point.y, point.z]));
      const material = new LineMaterial({
        color: ARC_COLORS.mine.progress,
        linewidth: TRACE_PX,
        depthTest: false,
      });
      material.resolution.set(this.width, this.height);
      const line = new Line2(geometry, material);
      line.renderOrder = TRACE_RANK;
      this.group.add(line);
      return line;
    });
    return true;
  }

  private wipe(trace: Trace): void {
    for (const line of trace.lines) {
      line.removeFromParent();
      line.geometry.dispose();
      line.material.dispose();
    }
    trace.lines = [];
  }

  private age({ mesh, start }: Stamp, now: number, unitsPerPixel: number): boolean {
    const age = now - start;
    if (age >= LIFE_MS) {
      mesh.removeFromParent();
      mesh.material.dispose();
      return false;
    }
    const imprint = Math.min(1, age / IMPRINT_MS);
    const settle = this.motion === 'full' ? 1.35 - 0.35 * (1 - (1 - imprint) ** 2) : 1;
    const fade = age < IMPRINT_MS ? 1 : 1 - (age - IMPRINT_MS) / (LIFE_MS - IMPRINT_MS);
    mesh.material.opacity =
      PEAK_OPACITY * fade * (this.motion === 'full' ? Math.min(1, imprint * 2) : 1);
    mesh.scale.setScalar(
      settle * unitsPerPixel * (mesh.geometry === this.geometries.combat ? SPLASH_PX : STAMP_PX),
    );
    return true;
  }
}
