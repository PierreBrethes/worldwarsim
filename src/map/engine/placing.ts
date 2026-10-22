import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Vector3,
} from 'three';
import type { MapMotion } from '@/domain/map-motion';
import type { LonLat } from '@/domain/geo';
import { faceCamera, textureOf } from './billboard';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

/** The same share as a movement's pawn: the ghost is the piece the player is about to put
 *  down, and it must weigh what a piece weighs on this board. */
const GHOST_SHARE = 0.031;

/** The pin's head: the maquette's blue-grey of a pose that holds, the red of one refused. */
const PIN_TONE = '#627584';
const PIN_REFUSED_TONE = '#8f3a2c';
const PIN_INK = '#2a2118';

/** Pin height in ghost-sides. A finger covers the first stretch of ground around it, so under
 *  one the head stands twice as high, clear above the fingertip. @a-mesurer */
const PIN_HEIGHT = 0.9;
const PIN_HEIGHT_TOUCH = 1.8;
/** The head falls onto the point when the magnet takes hold: the leap says "attracted there". */
const PIN_DROP_MS = 180;
const PIN_DROP_HEIGHT = 0.5;

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
  private readonly pinHead: Mesh<CircleGeometry, MeshBasicMaterial>;
  /** The pen line round the head, as the maquette inks it. */
  private readonly pinRim: Mesh<CircleGeometry, MeshBasicMaterial>;
  private refused = false;
  private snappedAt = Number.NEGATIVE_INFINITY;
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
    this.pinRim.renderOrder = 15;
    this.pinStem.renderOrder = 15;
    this.pinHead.renderOrder = 16;
    this.pin.add(this.pinStem, this.pinRim, this.pinHead);
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

  arm(sprite: string | null, snap: (pointer: LonLat) => LonLat): void {
    this.snap = snap;
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
    if (spot[0] !== pointer[0] || spot[1] !== pointer[1]) this.snappedAt = performance.now();
    this.object.position.copy(this.frame.projectLonLat(spot, GHOST_LIFT));
    this.object.visible = true;
    this.pin.visible = true;
  }

  /** Yaw and pitch on its foot, and a constant area on screen — the billboard rule of a pawn. */
  orient(cameraPosition: Vector3): void {
    if (!this.object.visible) return;
    faceCamera(this.object, cameraPosition);
    this.measure();
    const side = this.object.position.distanceTo(cameraPosition) * GHOST_SHARE;
    const height = side / Math.sqrt(this.aspect);
    this.mesh.scale.set(this.aspect * height, height, 1);
    this.pin.scale.setScalar(distanceUnit(this.object.position, cameraPosition));
    const headY =
      this.pinHeight +
      PIN_DROP_HEIGHT * this.pinDrop(performance.now() - this.snappedAt, this.motion);
    this.pinStem.scale.y = headY;
    this.pinHead.position.y = this.pinRim.position.y = headY;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const part of [this.pinStem, this.pinRim, this.pinHead]) {
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

const distanceUnit = (from: Vector3, eye: Vector3): number => from.distanceTo(eye) * GHOST_SHARE;
