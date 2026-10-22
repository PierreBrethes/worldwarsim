import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { nearestDeposit, snapTo, type DepositCall } from '@/domain/construction';
import type { MapMotion } from '@/domain/map-motion';
import type { LonLat } from '@/domain/geo';
import { faceCamera, textureOf } from './billboard';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { ADVERSE_INK } from './palette';

/** The same share as a movement's pawn: the ghost is the piece the player is about to put
 *  down, and it must weigh what a piece weighs on this board. */
const GHOST_SHARE = 0.031;

/** The pin's head: the maquette's blue-grey of a pose that holds, the red of one refused. */
const PIN_TONE = '#627584';
const PIN_REFUSED_TONE = ADVERSE_INK;
const PIN_INK = '#2a2118';
/** The paper ring outside the ink one: it lifts the pin off a night sea as off a day field. */
const PIN_PAPER = '#f1e8d2';

/** Pin height in ghost-sides. A finger covers the first stretch of ground around it, so under
 *  one the head stands twice as high, clear above the fingertip. @a-mesurer */
const PIN_HEIGHT = 0.9;
const PIN_HEIGHT_TOUCH = 1.8;
/** The head falls onto the point when the magnet takes hold: the leap says "attracted there". */
const PIN_DROP_MS = 180;
const PIN_DROP_HEIGHT = 0.5;

/** Pulled back by the thread, the ghost comes home in an elastic recall, longer than a leap. */
const RECALL_MS = 480;
const recall = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t) * Math.cos(t * 9));

/**
 * **Where the ghost of a deposit key stands, and what its thread aims at** (#239): it leaps onto
 * a deposit the pose would take within `PLACING_SNAP_KM`, and the thread runs to the nearest of
 * those from where it stands. A deposit out of reach wakes on the map, but neither attracts nor
 * is aimed at: its pose would be refused anyway.
 */
export function depositAim(calls: ReadonlyArray<DepositCall>, pointer: LonLat) {
  const open = calls.filter((call) => call.refusal === null);
  const spot = snapTo(
    pointer,
    open.map((call) => call.deposit.lonLat),
  );
  return { spot, target: nearestDeposit(open, spot) };
}

export type ScreenPoint = { readonly x: number; readonly y: number };

/** How far inside the screen's edge a thread to an unseen basin stops, in CSS pixels. */
export const THREAD_MARGIN = 24;

/**
 * **The thread on screen** (maquette `bassin.html`): it sags between the ghost and its basin, and
 * stops at the edge of the screen when the basin is off it — an arrow there points the way.
 */
export function threadPath(from: ScreenPoint, to: ScreenPoint, width: number, height: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const off = to.x < 0 || to.y < 0 || to.x > width || to.y > height;
  const t = !off
    ? 1
    : Math.min(
        dx > 0 ? (width - THREAD_MARGIN - from.x) / dx : dx < 0 ? (THREAD_MARGIN - from.x) / dx : 1,
        dy > 0
          ? (height - THREAD_MARGIN - from.y) / dy
          : dy < 0
            ? (THREAD_MARGIN - from.y) / dy
            : 1,
      );
  const end = { x: Math.round(from.x + dx * t), y: Math.round(from.y + dy * t) };
  const bend = {
    x: Math.round((from.x + end.x) / 2),
    y: Math.round(
      (from.y + end.y) / 2 + Math.min(60, Math.hypot(end.x - from.x, end.y - from.y) * 0.12),
    ),
  };
  return { to: end, bend, off, angle: Math.atan2(end.y - bend.y, end.x - bend.x) };
}

/** Just clear of the slab and of everything laid flat on it. */
const GHOST_LIFT = COUNTRY_THICKNESS + 0.02;

/**
 * **The building the player is holding, before it is anywhere** (ADR 0029). It follows the
 * pointer and, when it is armed with a magnet, leaps onto the place the magnet picks — a free
 * deposit, a quay — so that the click orders the very point the server reads.
 *
 * It is drawn in the engine rather than as a card following the mouse, because it designates a
 * place on the ground: an HTML ghost would sit at the pointer, away from the point the click is
 * actually going to take.
 */
export class PlacingGhost {
  readonly object = new Group();
  private readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private snap: ((pointer: LonLat) => LonLat) | null = null;
  private held: LonLat | null = null;
  private aspect = 1;
  private measured = false;
  /** **The exact point of the pose**, planted where the ghost holds it: the foot of the pin is the
   *  point the server will receive. It is its own group so that #239's thread and basins can be
   *  hung on it later. */
  readonly pin = new Group();
  private readonly pinStem: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly pinHead: Mesh<CircleGeometry, MeshBasicMaterial>;
  /** The pen line round the head, as the maquette inks it. */
  private readonly pinHalo: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly pinRim: Mesh<CircleGeometry, MeshBasicMaterial>;
  private refused = false;
  private snappedAt = Number.NEGATIVE_INFINITY;
  private snapped = false;
  /** Where the ghost stands, and where the thread pulled it from when the magnet took hold. */
  private readonly at = new Vector3();
  private readonly pulledFrom = new Vector3();
  /** A list of deposits: each one is a new catch. A coast is one catch, however far it runs. */
  private retargets = false;
  motion: MapMotion = 'full';

  constructor(
    private readonly frame: WorldFrame,
    touch = false,
  ) {
    this.pinHeight = touch ? PIN_HEIGHT_TOUCH : PIN_HEIGHT;
    const stem = new PlaneGeometry(0.05, 1);
    stem.translate(0, 0.5, 0);
    this.pinStem = new Mesh(stem, new MeshBasicMaterial({ color: PIN_INK, depthTest: false }));
    this.pinHead = new Mesh(
      new CircleGeometry(0.2, 16),
      new MeshBasicMaterial({ color: PIN_TONE, depthTest: false }),
    );
    this.pinRim = new Mesh(
      new CircleGeometry(0.25, 16),
      new MeshBasicMaterial({ color: PIN_INK, depthTest: false }),
    );
    this.pinHalo = new Mesh(
      new CircleGeometry(0.31, 16),
      new MeshBasicMaterial({ color: PIN_PAPER, depthTest: false }),
    );
    this.pinHalo.renderOrder = 14.5;
    this.pinRim.renderOrder = 15;
    this.pinStem.renderOrder = 15;
    this.pinHead.renderOrder = 16;
    this.pin.add(this.pinStem, this.pinHalo, this.pinRim, this.pinHead);
    this.pin.visible = false;
    this.object.add(this.pin);

    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    this.mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0.55,
        side: DoubleSide,
        /** Laid flat under a vertical camera it would fight the board for every pixel — the
         *  same reason a pawn passes over its own thread. */
        depthTest: false,
      }),
    );
    this.mesh.renderOrder = 14;
    this.object.add(this.mesh);
    this.object.visible = false;
  }

  readonly pinHeight: number;

  /** The colour of the pin's head: the same refusal as the card that follows the pointer. */
  get pinTone(): string {
    return this.refused ? PIN_REFUSED_TONE : PIN_TONE;
  }

  refuse(refused: boolean): void {
    this.refused = refused;
    this.pinHead.material.color.set(this.pinTone);
  }

  /** The extra height of the head, from 1 as the magnet takes hold to 0 once it has landed. */
  pinDrop(sinceSnapMs: number, motion: MapMotion): number {
    return motion === 'full' ? Math.max(0, 1 - sinceSnapMs / PIN_DROP_MS) : 0;
  }

  /** What a click would order, `null` while the pointer has not been on the board. */
  get spot(): LonLat | null {
    return this.held;
  }

  arm(sprite: string | null, snap: (pointer: LonLat) => LonLat, retargets = false): void {
    this.snap = snap;
    this.retargets = retargets;
    this.snapped = false;
    this.held = null;
    this.object.visible = false;
    this.pin.visible = false;
    const map = sprite === null ? null : textureOf(sprite);
    this.mesh.material.map = map;
    this.mesh.material.needsUpdate = true;
    this.measured = map === null;
    this.aspect = 1;
  }

  disarm(): void {
    this.snap = null;
    this.held = null;
    this.object.visible = false;
    this.pin.visible = false;
  }

  /**
   * **The pointer, or what the magnet makes of it.** A pointer off the board entirely leaves the
   * ghost where it stood: blinking it out at the edge of the map would say nothing.
   */
  aimAt(projectedX: number | null, projectedY: number | null): void {
    if (this.snap === null || projectedX === null || projectedY === null) return;
    const pointer = this.frame.lonLatAt(projectedX, projectedY);
    const spot = this.snap(pointer);
    if (this.held !== null && spot[0] === this.held[0] && spot[1] === this.held[1]) return;
    this.held = spot;
    const snapped = spot[0] !== pointer[0] || spot[1] !== pointer[1];
    /** The leap is dated when the magnet takes hold, not at each step along a coast it already holds. */
    if (snapped && (!this.snapped || this.retargets)) {
      this.snappedAt = performance.now();
      this.pulledFrom.copy(this.frame.projectLonLat(pointer, GHOST_LIFT));
    }
    this.snapped = snapped;
    this.at.copy(this.frame.projectLonLat(spot, GHOST_LIFT));
    this.object.position.copy(this.at);
    this.object.visible = true;
    this.pin.visible = true;
  }

  /** Yaw and pitch on its foot, and a constant area on screen — the billboard rule of a pawn. */
  orient(cameraPosition: Vector3): void {
    if (!this.object.visible) return;
    const pulled = (performance.now() - this.snappedAt) / RECALL_MS;
    if (this.snapped && this.motion === 'full' && pulled < 1)
      this.object.position.lerpVectors(this.pulledFrom, this.at, recall(pulled));
    else this.object.position.copy(this.at);
    faceCamera(this.object, cameraPosition);
    this.measure();
    const side = this.object.position.distanceTo(cameraPosition) * GHOST_SHARE;
    this.pin.scale.setScalar(side);
    const height = side / Math.sqrt(this.aspect);
    this.mesh.scale.set(this.aspect * height, height, 1);
    const headY =
      this.pinHeight +
      PIN_DROP_HEIGHT * this.pinDrop(performance.now() - this.snappedAt, this.motion);
    this.pinStem.scale.y = headY;
    this.pinHead.position.y = this.pinRim.position.y = this.pinHalo.position.y = headY;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const part of [this.pinStem, this.pinHalo, this.pinRim, this.pinHead]) {
      part.geometry.dispose();
      part.material.dispose();
    }
  }

  /** The ratio is only known once the bitmap is decoded, so it is asked for until it answers. */
  private measure(): void {
    if (this.measured) return;
    const image = this.mesh.material.map?.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) return;
    this.aspect = image.width / image.height;
    this.measured = true;
  }
}
