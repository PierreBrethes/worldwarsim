import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import { faceCamera, textureOf } from './billboard';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

/** A coast cell, in the two frames the magnet needs: the board's, to measure, and the game's,
 *  to order the building on. */
export type CoastSpot = {
  readonly x: number;
  readonly y: number;
  readonly lonLat: LonLat;
};

/** The same share as a movement's pawn: the ghost is the piece the player is about to put
 *  down, and it must weigh what a piece weighs on this board. */
const GHOST_SHARE = 0.031;

/** Just clear of the slab and of everything laid flat on it. */
const GHOST_LIFT = COUNTRY_THICKNESS + 0.02;

/**
 * **The building the player is holding, before it is anywhere.** It follows the pointer and
 * snaps onto the nearest coast cell of the region it was armed on — never inland, never onto
 * a neighbour's shore: the candidates are computed once at arming, and the magnet only picks
 * the closest one.
 *
 * It is drawn in the engine rather than as a card following the mouse, because it designates a
 * place on the ground: an HTML ghost would sit at the pointer, half a region away from the quay
 * the click is actually going to take.
 */
export class PlacingGhost {
  readonly object = new Group();
  private readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private candidates: ReadonlyArray<CoastSpot> = [];
  private held: CoastSpot | null = null;
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

  /** What a click would order, `null` while the ghost has found no shore to stand on. */
  get spot(): CoastSpot | null {
    return this.held;
  }

  arm(sprite: string | null, candidates: ReadonlyArray<CoastSpot>): void {
    this.candidates = candidates;
    this.held = null;
    this.object.visible = false;
    const map = sprite === null ? null : textureOf(sprite);
    this.mesh.material.map = map;
    this.mesh.material.needsUpdate = true;
    this.measured = map === null;
    this.aspect = 1;
  }

  disarm(): void {
    this.candidates = [];
    this.held = null;
    this.object.visible = false;
  }

  /**
   * **The magnet.** The nearest candidate in projected units — the board's own frame, where a
   * distance is the one the eye reads. A pointer off the board entirely leaves the ghost where
   * it stood: it is still holding a legal place, and blinking it out at the edge of the map
   * would say the opposite.
   */
  aimAt(projectedX: number | null, projectedY: number | null): void {
    if (this.candidates.length === 0) return;
    if (projectedX === null || projectedY === null) return;
    let best: CoastSpot | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.candidates) {
      const distance =
        (candidate.x - projectedX) * (candidate.x - projectedX) +
        (candidate.y - projectedY) * (candidate.y - projectedY);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = candidate;
    }
    if (best === null || best === this.held) return;
    this.held = best;
    this.object.position.copy(this.frame.toWorld(best.x, best.y, GHOST_LIFT));
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
