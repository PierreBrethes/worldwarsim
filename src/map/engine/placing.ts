import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import { faceCamera, textureOf } from './billboard';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

/** The same share as a movement's pawn: the ghost is the piece the player is about to put
 *  down, and it must weigh what a piece weighs on this board. */
const GHOST_SHARE = 0.031;

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

  constructor(private readonly frame: WorldFrame) {
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

  /** What a click would order, `null` while the pointer has not been on the board. */
  get spot(): LonLat | null {
    return this.held;
  }

  arm(sprite: string | null, snap: (pointer: LonLat) => LonLat): void {
    this.snap = snap;
    this.held = null;
    this.object.visible = false;
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
  }

  /**
   * **The pointer, or what the magnet makes of it.** A pointer off the board entirely leaves the
   * ghost where it stood: blinking it out at the edge of the map would say nothing.
   */
  aimAt(projectedX: number | null, projectedY: number | null): void {
    if (this.snap === null || projectedX === null || projectedY === null) return;
    const spot = this.snap(this.frame.lonLatAt(projectedX, projectedY));
    if (this.held !== null && spot[0] === this.held[0] && spot[1] === this.held[1]) return;
    this.held = spot;
    this.object.position.copy(this.frame.projectLonLat(spot, GHOST_LIFT));
    this.object.visible = true;
  }

  /** Yaw and pitch on its foot, and a constant area on screen — the billboard rule of a pawn. */
  orient(cameraPosition: Vector3): void {
    if (!this.object.visible) return;
    faceCamera(this.object, cameraPosition);
    this.measure();
    const side = this.object.position.distanceTo(cameraPosition) * GHOST_SHARE;
    const height = side / Math.sqrt(this.aspect);
    this.mesh.scale.set(this.aspect * height, height, 1);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
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
