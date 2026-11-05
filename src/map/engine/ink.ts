import { playTableSound } from '../table-sound';
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
import { TAKEN_UP_MS, stampAt, type InkBurst, type StampWords } from '@/domain/ink-bursts';
import type { MapMotion } from '@/domain/map-motion';
import type { WorldFrame } from './frame';
import { ARC_COLORS, PALETTE } from './palette';
import { InkRing } from './ink-ring';
import { dismantleSweepAt, DISMANTLE_SWEEP_MS } from './timelines/dismantle';
import { RAZE_RING_MS, razeRingAt } from './timelines/raze';
import { Ribbon, RibbonMaterial } from './route-ribbon';
import { threadWidth, type ThreadLeg } from './thread';

const TRACE_MS = 800;
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
/** Just above the point, the mockup's `dy: -34` of a 68 stamp (`InkBurst.over`). */
const WORDED_OVER = [0, -0.5] as const;
const STAMP_RED = '#9d4638';

/** @a-mesurer : le cachet, un peu plus grand que le tampon (84 contre 68 dans la maquette). */
const SEAL_PX = 190;
/** @a-mesurer : les deux ondes du cachet (`scenes.js`, `ripples`) — à 0 et 0,22 s, 0,9 s chacune,
 *  de 10 à 70 px, d'une opacité de 0,7 qui tombe à rien. */
const RIPPLE_DELAYS_MS = [0, 220] as const;
const RIPPLE_MS = 900;
const RIPPLE_FROM_PX = 10;
const RIPPLE_TO_PX = 70;

/** The ring of ink a dismantled pin leaves, in CSS pixels. @a-mesurer */
const PIN_RING_PX = 14;

const REACH_HOLD_MS = 600;
const REACH_FADE_MS = 600;

/** A pen accelerates, then slows down to lift: ease in-out, never linear. */
export const penEase = (share: number): number =>
  share < 0.5 ? 4 * share ** 3 : 1 - (-2 * share + 2) ** 3 / 2;

/** A pen stroke is a ribbon drawn up to `end`: the thread's own band, revealed as it goes. */
type PenStroke = {
  readonly ribbons: ReadonlyArray<Ribbon>;
  readonly material: RibbonMaterial;
  readonly length: number;
  readonly start: number;
  /** How long the pen takes; `0` lays the stroke at once. */
  readonly pen: number;
  /** How long a reach is held once drawn, before it fades. */
  readonly hold: number;
};
type Stamp = {
  readonly mesh: Mesh<ShapeGeometry | PlaneGeometry, MeshBasicMaterial>;
  readonly start: number;
  /** Where it was put, before it is pushed aside by its size on screen. */
  readonly at: Vector3;
  readonly worded: boolean;
  readonly kind: InkBurst['kind'];
  readonly holdMs?: number;
  readonly over?: true;
  /** The age at which a gesture took it up (`lift`). */
  liftedAt?: number;
  /** Its sound, still to come while it is delayed. */
  heard?: ReturnType<typeof setTimeout>;
};

const PLANE = new PlaneGeometry(1, 1);

/** The prototype's `stampTex`: a double ring, the word, the hour between stars, and the grain
 *  of a rubber stamp that did not take everywhere. */
export function wordedTexture({ word, hour }: StampWords, ink = STAMP_RED): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(256, 256);
  ctx.strokeStyle = ctx.fillStyle = ink;
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
  return grained(canvas, ctx);
}

/** The grain of a rubber stamp that did not take everywhere. */
function grained(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): CanvasTexture {
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

/**
 * **Le cachet des Sept** (#442, `storyboard-moments/commun/carte.js`, `sealHtml`) : rond, sur
 * papier, à l'encre du preneur — le nom du point en arc, l'heure, « IV » au quatrième, et sept
 * pastilles dont autant de pleines qu'il en tient. Dessiné dans la case de 100 de la maquette.
 */
function sealTexture(
  { word, hour }: StampWords,
  ink: string,
  held: number,
  roman?: string,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(256, 256);
  ctx.scale(5.12, 5.12);
  ctx.fillStyle = 'rgba(233,222,196,.95)';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // The name along the upper arc, letter by letter, centred on the top.
  ctx.font = '700 15px "Bodoni Moda", Georgia, serif';
  const name = word.toLocaleUpperCase('fr-FR');
  const widths = [...name].map((letter) => ctx.measureText(letter).width + 1);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let angle = -Math.PI / 2 - total / 31 / 2;
  [...name].forEach((letter, i) => {
    const step = widths[i]! / 31;
    ctx.save();
    ctx.rotate(angle + step / 2 + Math.PI / 2);
    ctx.fillText(letter, 0, -31);
    ctx.restore();
    angle += step;
  });
  ctx.font = '500 12.5px "IBM Plex Mono", monospace';
  ctx.fillText(`★ ${hour} ★`, 0, 8);
  if (roman !== undefined) {
    ctx.font = '700 10px "Bodoni Moda", Georgia, serif';
    ctx.fillText(roman, 0, -6);
  }
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const at = Math.PI * (0.22 + (0.56 * i) / 6);
    ctx.beginPath();
    ctx.arc(Math.cos(at) * 31, Math.sin(at) * 31, 3.1, 0, Math.PI * 2);
    if (i < held) ctx.fill();
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 256, 256);
  return grained(canvas, ctx);
}

const disc = (x: number, y: number, radius: number): Shape =>
  new Shape().absarc(x, y, radius, 0, Math.PI * 2, false);

/** A round stamp: a ring and a core, the seal of something that arrived. */
function stampShapes(): Shape[] {
  const ring = disc(0, 0, 1);
  ring.holes.push(new Path().absarc(0, 0, 0.72, 0, Math.PI * 2, true));
  return [ring, disc(0, 0, 0.4)];
}

/** A thin ring, the wave of ink a seal sends out. */
function rippleShape(): Shape {
  const ring = disc(0, 0, 1);
  ring.holes.push(new Path().absarc(0, 0, 0.93, 0, Math.PI * 2, true));
  return ring;
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
  /** A delayed stamp is heard as it lands: the board gone, it is not. */
  private readonly heard = new Set<ReturnType<typeof setTimeout>>();
  private reaches: PenStroke[] = [];
  private erasures: PenStroke[] = [];
  /** The rings of ink where a dismantled pin stood, when motion is reduced (#340). */
  private rings: Array<{ readonly ring: InkRing; readonly start: number }> = [];
  /** The two waves of ink a seal of the Seven sends out from its mast (#442). */
  private ripples: Array<{
    readonly mesh: Mesh<ShapeGeometry, MeshBasicMaterial>;
    readonly start: number;
  }> = [];
  private viewHeight = 1;
  private readonly geometries = {
    arrival: new ShapeGeometry(stampShapes()),
    combat: new ShapeGeometry(splashShapes()),
    ripple: new ShapeGeometry(rippleShape()),
  };

  constructor(
    private readonly frame: WorldFrame,
    private readonly enabled: boolean,
  ) {}

  get active(): boolean {
    return (
      this.traces.length +
        this.stamps.length +
        this.reaches.length +
        this.erasures.length +
        this.rings.length +
        this.ripples.length >
      0
    );
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
  traceReach(
    stroke: ReadonlyArray<Vector3>,
    now: number,
    /** The victory's line (#442): its winner's ink, its own pen, held to the edition. */
    {
      ink,
      penMs = TRACE_MS,
      holdMs = REACH_HOLD_MS,
    }: { ink?: string; penMs?: number; holdMs?: number } = {},
  ): void {
    if (!this.enabled || this.motion === 'off') return;
    this.reaches.push(
      this.penStroke([stroke], now, this.motion === 'full' ? penMs : 0, ink, holdMs),
    );
  }

  /** **The area a dismantled point coloured goes** (#340): its circle is erased turning from the
   *  north. Reduced motion draws nothing: the area is gone with the next view. */
  eraseReach(stroke: ReadonlyArray<Vector3>, now: number): void {
    if (!this.enabled || this.motion !== 'full') return;
    const erased = this.penStroke([stroke], now, 0);
    // What lies before the cut is what is gone.
    erased.material.coveredOpacity = 0;
    erased.material.cut = 0;
    this.erasures.push(erased);
  }

  /** **A ring of ink where a dismantled pin stood**, opening and fading (reduced motion, #340). */
  ringAt(at: Vector3, now: number): void {
    if (!this.enabled || this.motion !== 'reduced') return;
    const ring = new InkRing();
    ring.position.copy(at);
    ring.userData.ground = true;
    this.group.add(ring);
    this.rings.push({ ring, start: now });
  }

  /** A worded burst is the prototype's stamp; a combat keeps its splash under it, an arrival
   *  wears the stamp alone. */
  burst(
    { kind, at, words, delayMs: asked = 0, holdMs, over, ink, held, roman }: InkBurst,
    now: number,
  ): void {
    if (!this.enabled || this.motion === 'off') return;
    const point = this.frame.projectLonLat(at);
    const seal = kind === 'seal';
    // A seal, or the count it broke, waits for its flag to change; reduced motion changes it at once.
    const delayMs = (seal || kind === 'raceBroken') && this.motion !== 'full' ? 0 : asked;
    if ((seal || kind === 'raceBroken') && this.motion === 'full')
      for (const behind of RIPPLE_DELAYS_MS)
        this.ripple(point, ink ?? STAMP_RED, now + delayMs + behind);
    if (words !== undefined) {
      const texture = seal
        ? sealTexture(words, ink ?? STAMP_RED, held ?? 0, roman)
        : wordedTexture(words, ink);
      const stamp = this.stamp(kind, PLANE, { map: texture }, point, now + delayMs, true, {
        holdMs,
        over,
      });
      if (seal) stamp.mesh.userData.seal = true;
      const timer = setTimeout(() => {
        this.heard.delete(timer);
        playTableSound('stamp');
      }, delayMs);
      this.heard.add(timer);
      stamp.heard = timer;
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

  /** Takes up every stamp of `kind`, or every one, in a quarter of a second: what the replay
   *  pressed goes with it, and a gesture ends the absence tour's (#439). A delayed one never lands. */
  lift(kind: InkBurst['kind'] | undefined, now: number): void {
    for (const stamp of this.stamps)
      if (kind === undefined || stamp.kind === kind) {
        stamp.liftedAt = Math.min(stamp.liftedAt ?? Infinity, now - stamp.start);
        if (stamp.heard !== undefined && stamp.start > now) {
          clearTimeout(stamp.heard);
          this.heard.delete(stamp.heard);
        }
      }
  }

  private ripple(at: Vector3, ink: string, start: number): void {
    const mesh = new Mesh(
      this.geometries.ripple,
      new MeshBasicMaterial({
        color: ink,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = BURST_RANK;
    mesh.position.copy(at);
    this.group.add(mesh);
    this.ripples.push({ mesh, start });
  }

  private stamp(
    kind: InkBurst['kind'],
    geometry: ShapeGeometry | PlaneGeometry,
    paint: { color?: string; map?: CanvasTexture },
    at: Vector3,
    start: number,
    worded: boolean,
    { holdMs, over }: { holdMs?: number | undefined; over?: true | undefined } = {},
  ): Stamp {
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
    const stamp: Stamp = {
      mesh,
      start,
      at,
      worded,
      kind,
      ...(holdMs === undefined ? {} : { holdMs }),
      ...(over === undefined ? {} : { over }),
    };
    this.stamps.push(stamp);
    return stamp;
  }

  animate(now: number, unitsPerPixel: number): void {
    this.traces = this.traces.filter((trace) => this.draw(trace, now));
    this.stamps = this.stamps.filter((stamp) => this.age(stamp, now, unitsPerPixel));
    this.reaches = this.reaches.filter((reach) => this.drawReach(reach, now));
    this.erasures = this.erasures.filter((erasure) => this.drawErasure(erasure, now));
    this.rings = this.rings.filter((each) => this.drawRing(each, now, unitsPerPixel));
    this.ripples = this.ripples.filter(({ mesh, start }) => {
      const share = (now - start) / RIPPLE_MS;
      if (share >= 1) {
        mesh.removeFromParent();
        mesh.material.dispose();
        return false;
      }
      const shown = Math.max(0, share);
      mesh.material.opacity = share < 0 ? 0 : 0.7 * (1 - shown);
      mesh.scale.setScalar(
        (RIPPLE_FROM_PX + (RIPPLE_TO_PX - RIPPLE_FROM_PX) * penEase(shown)) * unitsPerPixel,
      );
      return true;
    });
  }

  dispose(): void {
    for (const timer of this.heard) clearTimeout(timer);
    for (const stroke of [...this.traces, ...this.reaches, ...this.erasures]) wipe(stroke);
    for (const { ring } of this.rings) endRing(ring);
    for (const { mesh } of this.ripples) mesh.material.dispose();
    this.ripples = [];
    this.erasures = [];
    this.rings = [];
    for (const stamp of this.stamps) unstamp(stamp);
    this.reaches = [];
    this.traces = [];
    this.stamps = [];
    this.geometries.arrival.dispose();
    this.geometries.combat.dispose();
    this.geometries.ripple.dispose();
    this.group.removeFromParent();
  }

  private penStroke(
    strands: ReadonlyArray<ReadonlyArray<Vector3>>,
    now: number,
    pen: number,
    color: string = ARC_COLORS.mine.progress,
    hold = REACH_HOLD_MS,
  ): PenStroke {
    const ink = { color, opacity: 1 };
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
    return { ribbons, material, length, start: now, pen, hold };
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
    const fading = elapsed - reach.pen - reach.hold;
    if (fading >= REACH_FADE_MS) {
      wipe(reach);
      return false;
    }
    reach.material.coveredOpacity = fading > 0 ? 1 - fading / REACH_FADE_MS : 1;
    reach.material.end =
      elapsed < reach.pen ? penEase(elapsed / reach.pen) * reach.length : reach.length;
    return true;
  }

  private drawErasure(stroke: PenStroke, now: number): boolean {
    const elapsed = now - stroke.start;
    if (elapsed >= DISMANTLE_SWEEP_MS) {
      wipe(stroke);
      return false;
    }
    stroke.material.cut = dismantleSweepAt(elapsed) * stroke.length;
    return true;
  }

  private drawRing(
    { ring, start }: { ring: InkRing; start: number },
    now: number,
    perPixel: number,
  ): boolean {
    const elapsed = now - start;
    if (elapsed >= RAZE_RING_MS) {
      endRing(ring);
      return false;
    }
    const { size, opacity } = razeRingAt(elapsed);
    ring.style('ripple', 0, true);
    ring.opacity = opacity;
    ring.scale.setScalar(size * PIN_RING_PX * perPixel);
    return true;
  }

  private age(stamp: Stamp, now: number, unitsPerPixel: number): boolean {
    const { mesh, start } = stamp;
    const age = now - start;
    if (stamp.worded) {
      const at = stampAt(age, this.motion, stamp.holdMs, stamp.liftedAt ?? null);
      if (at === null) {
        unstamp(stamp);
        return false;
      }
      mesh.material.opacity = at.opacity;
      const size = (mesh.userData.seal === true ? SEAL_PX : WORDED_PX) * unitsPerPixel;
      mesh.scale.setScalar(at.scale * size);
      const [dx, dz] = stamp.over === true ? WORDED_OVER : WORDED_ASIDE;
      mesh.position.set(stamp.at.x + dx * size, stamp.at.y, stamp.at.z + dz * size);
      return true;
    }
    if (age >= LIFE_MS || (stamp.liftedAt !== undefined && age >= stamp.liftedAt + TAKEN_UP_MS)) {
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

function endRing(ring: InkRing): void {
  ring.removeFromParent();
  ring.material.dispose();
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
