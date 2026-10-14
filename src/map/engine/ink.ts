import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Path,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { stampAt, type InkBurst, type StampWords } from '@/domain/ink-bursts';
import type { MapMotion } from '@/domain/map-motion';
import type { WorldFrame } from './frame';
import { ARC_COLORS, PALETTE } from './palette';
import { Ribbon, RibbonMaterial } from './route-ribbon';
import { threadWidth, type ThreadLeg } from './thread';

export const TRACE_MS = 800;
const TRACE_RANK = 12.4;
const TRACE_PX = 2.5;

const BURST_RANK = 13.5;
const IMPRINT_MS = 300;
const LIFE_MS = 2600;
const PEAK_OPACITY = 0.8;
const STAMP_PX = 16;
const SPLASH_PX = 14;
/** The prototype's stamp is 6 units beside a piece of 1.35: on screen, about a hand's breadth. */
const WORDED_PX = 170;
/** Beside the point, not on it: the piece stays readable under its stamp (`+3.5, +2.5` of 6). */
const WORDED_ASIDE = [0.95, 0.7] as const;
const STAMP_RED = '#9d4638';

const REACH_HOLD_MS = 600;
const REACH_FADE_MS = 600;

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

/** A pen stroke is a ribbon drawn up to `end`: the thread's own band, revealed as it goes. */
type PenStroke = {
  readonly ribbons: ReadonlyArray<Ribbon>;
  readonly material: RibbonMaterial;
  readonly length: number;
  readonly start: number;
  /** How long the pen takes; `0` lays the stroke at once. */
  readonly pen: number;
};
type Stamp = {
  readonly mesh: Mesh<ShapeGeometry | PlaneGeometry, MeshBasicMaterial>;
  readonly start: number;
  /** Where it was put, before it is pushed aside by its size on screen. */
  readonly at: Vector3;
  readonly worded: boolean;
  readonly kind: InkBurst['kind'];
};

const PLANE = new PlaneGeometry(1, 1);

/** The prototype's `stampTex`: a double ring, the word, the hour between stars, and the grain
 *  of a rubber stamp that did not take everywhere. */
export function wordedTexture({ word, hour }: StampWords): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(256, 256);
  ctx.strokeStyle = ctx.fillStyle = STAMP_RED;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(0, 0, 220, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 192, 0, Math.PI * 2);
  ctx.stroke();
  const text = word.toLocaleUpperCase('fr-FR');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 64px "Bodoni Moda", Georgia, serif';
  const fit = Math.min(64, (64 * 320) / ctx.measureText(text).width);
  ctx.font = `700 ${fit}px "Bodoni Moda", Georgia, serif`;
  // Stroked as well as filled: a didone's hairlines vanish once the sheet is seen at a slant.
  ctx.lineWidth = 3;
  ctx.fillText(text, 0, 0);
  ctx.strokeText(text, 0, 0);
  ctx.font = '600 30px "IBM Plex Mono", monospace';
  ctx.fillText(`★  ${hour}  ★`, 0, 80);
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 900; k++) {
    ctx.globalAlpha = Math.random() * 0.8;
    ctx.fillRect(
      Math.random() * 512 - 256,
      Math.random() * 512 - 256,
      Math.random() * 6,
      Math.random() * 3,
    );
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

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
  private traces: PenStroke[] = [];
  private stamps: Stamp[] = [];
  private reaches: PenStroke[] = [];
  private viewHeight = 1;
  private readonly geometries = {
    arrival: new ShapeGeometry(stampShapes()),
    combat: new ShapeGeometry(splashShapes()),
  };

  constructor(
    private readonly frame: WorldFrame,
    private readonly enabled: boolean,
  ) {}

  get active(): boolean {
    return this.traces.length + this.stamps.length + this.reaches.length > 0;
  }

  resize(_width: number, height: number): void {
    this.viewHeight = height;
    for (const stroke of [...this.traces, ...this.reaches]) stroke.material.viewHeight = height;
  }

  /** Returns how long the pen takes, `0` when the thread should simply be there. */
  trace(legs: ReadonlyArray<ThreadLeg>, now: number): number {
    if (!this.enabled || this.motion !== 'full') return 0;
    this.traces.push(
      this.penStroke(
        legs.flatMap((leg) => leg.strands.map((strand) => strand.vertices)),
        now,
        TRACE_MS,
      ),
    );
    return TRACE_MS;
  }

  /** The circle a point now holds, or the shot a battery fired (B20): pen-drawn when motion is
   *  full and simply there, briefly, when it is reduced. */
  traceReach(stroke: ReadonlyArray<Vector3>, now: number): void {
    if (!this.enabled || this.motion === 'off') return;
    this.reaches.push(this.penStroke([stroke], now, this.motion === 'full' ? TRACE_MS : 0));
  }

  /** A worded burst is the prototype's stamp; a combat keeps its splash under it, an arrival
   *  wears the stamp alone. */
  burst({ kind, at, words, delayMs = 0 }: InkBurst, now: number): void {
    if (!this.enabled || this.motion === 'off') return;
    const point = this.frame.projectLonLat(at);
    if (words !== undefined) {
      const texture = wordedTexture(words);
      this.stamp(kind, PLANE, { map: texture }, point, now + delayMs, true);
    }
    if (kind === 'combat' || (kind === 'arrival' && words === undefined))
      this.stamp(
        kind,
        this.geometries[kind],
        { color: kind === 'combat' ? ARC_COLORS.enemyDetected.trace : PALETTE.border },
        point,
        now,
        false,
      );
  }

  /** Lifts every stamp of `kind` at once: what the replay pressed goes with it. */
  lift(kind: InkBurst['kind']): void {
    for (const stamp of this.stamps) if (stamp.kind === kind) unstamp(stamp);
    this.stamps = this.stamps.filter((stamp) => stamp.kind !== kind);
  }

  private stamp(
    kind: InkBurst['kind'],
    geometry: ShapeGeometry | PlaneGeometry,
    paint: { color?: string; map?: CanvasTexture },
    at: Vector3,
    start: number,
    worded: boolean,
  ): void {
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        ...paint,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        // Ink is ink: the lamp's tone curve would wash the stamp's red into the sheet.
        toneMapped: false,
        side: DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = BURST_RANK;
    mesh.position.copy(at);
    this.group.add(mesh);
    this.stamps.push({ mesh, start, at, worded, kind });
  }

  animate(now: number, unitsPerPixel: number): void {
    this.traces = this.traces.filter((trace) => this.draw(trace, now));
    this.stamps = this.stamps.filter((stamp) => this.age(stamp, now, unitsPerPixel));
    this.reaches = this.reaches.filter((reach) => this.drawReach(reach, now));
  }

  dispose(): void {
    for (const stroke of [...this.traces, ...this.reaches]) wipe(stroke);
    for (const stamp of this.stamps) unstamp(stamp);
    this.reaches = [];
    this.traces = [];
    this.stamps = [];
    this.geometries.arrival.dispose();
    this.geometries.combat.dispose();
    this.group.removeFromParent();
  }

  private penStroke(
    strands: ReadonlyArray<ReadonlyArray<Vector3>>,
    now: number,
    pen: number,
  ): PenStroke {
    const ink = { color: ARC_COLORS.mine.progress, opacity: 1 };
    const material = new RibbonMaterial({
      width: threadWidth(TRACE_PX),
      floorPx: TRACE_PX,
      covered: ink,
      remaining: ink,
    });
    material.viewHeight = this.viewHeight;
    let length = 0;
    const ribbons = strands.map((vertices) => {
      const ribbon = new Ribbon(vertices, material, length);
      length = ribbon.geometry.getAttribute('along').array.at(-1) ?? length;
      ribbon.renderOrder = TRACE_RANK;
      ribbon.frustumCulled = false;
      this.group.add(ribbon);
      return ribbon;
    });
    material.cut = length;
    material.end = pen > 0 ? 0 : length;
    return { ribbons, material, length, start: now, pen };
  }

  private draw(trace: PenStroke, now: number): boolean {
    const elapsed = (now - trace.start) / TRACE_MS;
    if (elapsed >= 1) {
      wipe(trace);
      return false;
    }
    trace.material.end = penEase(Math.max(0, elapsed)) * trace.length;
    return true;
  }

  private drawReach(reach: PenStroke, now: number): boolean {
    const elapsed = now - reach.start;
    const fading = elapsed - reach.pen - REACH_HOLD_MS;
    if (fading >= REACH_FADE_MS) {
      wipe(reach);
      return false;
    }
    reach.material.coveredOpacity = fading > 0 ? 1 - fading / REACH_FADE_MS : 1;
    reach.material.end =
      elapsed < reach.pen ? penEase(elapsed / reach.pen) * reach.length : reach.length;
    return true;
  }

  private age(stamp: Stamp, now: number, unitsPerPixel: number): boolean {
    const { mesh, start } = stamp;
    const age = now - start;
    if (stamp.worded) {
      const at = stampAt(age, this.motion);
      if (at === null) {
        unstamp(stamp);
        return false;
      }
      mesh.material.opacity = at.opacity;
      const size = WORDED_PX * unitsPerPixel;
      mesh.scale.setScalar(at.scale * size);
      mesh.position.set(
        stamp.at.x + WORDED_ASIDE[0] * size,
        stamp.at.y,
        stamp.at.z + WORDED_ASIDE[1] * size,
      );
      return true;
    }
    if (age >= LIFE_MS) {
      unstamp(stamp);
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

function unstamp({ mesh }: Stamp): void {
  mesh.removeFromParent();
  mesh.material.map?.dispose();
  mesh.material.dispose();
}

function wipe(stroke: PenStroke): void {
  for (const ribbon of stroke.ribbons) {
    ribbon.removeFromParent();
    ribbon.geometry.dispose();
  }
  stroke.material.dispose();
}
