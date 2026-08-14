import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { Medium } from '@/domain/routing';
import { faceCamera, textureOf } from './billboard';

/**
 * A share of the camera distance: a pawn keeps its size on screen. At a fixed world size it
 * is a dust speck in orbit and covers the North Sea up close. The silhouette is narrower
 * than the sprite it replaces, but solid: at equal size it weighs more to the eye, and
 * eight movements out of the same port would make a blot.
 */
const PAWN_SHARE = 0.028;
const PAWN_SILHOUETTE_SHARE = 0.018;

/**
 * Three silhouettes, recognizable at a glance without a label: prism on the ground, sailed
 * hull on the water, delta in the sky. They are drawn in the plate's frame — y downward,
 * height around 12 — then flipped and normalized.
 */
const SILHOUETTES: Readonly<Record<Medium, ReadonlyArray<ReadonlyArray<readonly [number, number]>>>> = {
  land: [[[-9, 2], [0, 6], [9, 2], [0, -2]]],
  sea: [
    [[-10, 0], [10, 0], [6, 5], [-6, 5]],
    [[-1, 0], [-1, -12], [8, -8]],
  ],
  air: [[[-9, 0], [0, -5], [9, 0], [0, 3]]],
};

/**
 * Plate width. The three silhouettes are normalized to it, so they weigh the same on screen:
 * a delta must not look more hurried than a prism because it is thinner.
 */
const PLATE_WIDTH = 20;

/**
 * A movement's pawn: a single piece over the whole route, changing costume at the dock and
 * standing still during the transfer. The billboard only follows the camera's yaw — a shape
 * tilting with it would lift off the board, and a three.js `Sprite` slides as soon as the
 * orbit dives.
 *
 * The majority role's sprite only takes the land costume: a column is recognized by what
 * composes it, a convoy at sea by its hull and a flight by its delta — embarked infantry
 * travels on a ship, not on foot. `spriteUrl` is already null for any enemy arc
 * (`movementSprite`), so no display `if` here can leak a role.
 */
export class Pawn {
  readonly object = new Group();
  private readonly costumes = new Map<Medium, Group>();
  private sprite: Mesh<PlaneGeometry, MeshBasicMaterial> | null = null;
  private readonly color: string;
  private medium: Medium = 'land';
  private aspect = 1;
  private aspectMeasured = false;
  private westward = false;

  constructor(spriteUrl: string | null, color: string) {
    this.color = color;
    for (const medium of ['land', 'sea', 'air'] as const) {
      const costume =
        medium === 'land' && spriteUrl !== null
          ? this.buildSprite(spriteUrl)
          : this.buildSilhouette(medium);
      costume.visible = medium === this.medium;
      this.costumes.set(medium, costume);
      this.object.add(costume);
    }
  }

  set visible(value: boolean) {
    this.object.visible = value;
  }

  /**
   * The pawn's costume follows the medium of the segment beneath it. For an enemy movement
   * it is a silhouette and nothing else — land, sea or air, never the type nor the
   * composition (sheet 04): an identified movement's detail reads on its timeline card,
   * not here.
   */
  wear(medium: Medium): void {
    if (medium === this.medium) return;
    const leaving = this.costumes.get(this.medium);
    if (leaving) leaving.visible = false;
    this.medium = medium;
    const entering = this.costumes.get(medium);
    if (entering) entering.visible = true;
  }

  place(position: Vector3, pointAhead: Vector3): void {
    this.object.position.copy(position);
    this.westward = pointAhead.x < position.x;
  }

  /**
   * The size is carried by the costume, not by `object`: the sprite and the silhouette have
   * neither the same screen share nor the same frame — one hangs under its point, the other
   * stands on it — and a common scale would make the pawn's size jump at the dock.
   */
  orient(cameraPosition: Vector3): void {
    const distance = this.object.position.distanceTo(cameraPosition);
    faceCamera(this.object, cameraPosition);
    const sign = this.westward ? -1 : 1;
    if (this.sprite !== null && this.medium === 'land') {
      const height = distance * PAWN_SHARE;
      this.measureAspect();
      this.sprite.scale.set(this.aspect * height * sign, height, 1);
      return;
    }
    const costume = this.costumes.get(this.medium);
    if (costume === undefined) return;
    const size = distance * PAWN_SILHOUETTE_SHARE;
    costume.scale.set(size * sign, size, size);
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const costume of this.costumes.values()) {
      for (const child of costume.children) {
        const mesh = child as Mesh<ShapeGeometry | PlaneGeometry, MeshBasicMaterial>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  }

  /**
   * The texture stays in the shared cache: two French armor columns point at the same
   * bitmap, and freeing it here would burst the neighbor's.
   */
  private buildSprite(url: string): Group {
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    this.sprite = new Mesh(
      geometry,
      new MeshBasicMaterial({
        map: textureOf(url),
        transparent: true,
        alphaTest: 0.35,
        side: DoubleSide,
      }),
    );
    this.sprite.renderOrder = 13;
    const group = new Group();
    group.add(this.sprite);
    return group;
  }

  private buildSilhouette(medium: Medium): Group {
    const group = new Group();
    for (const outline of SILHOUETTES[medium]) {
      const shape = new Shape();
      outline.forEach(([x, y], index) => {
        const [px, py] = [x / PLATE_WIDTH, -y / PLATE_WIDTH];
        if (index === 0) shape.moveTo(px, py);
        else shape.lineTo(px, py);
      });
      shape.closePath();
      const mesh = new Mesh(
        new ShapeGeometry(shape),
        new MeshBasicMaterial({ color: this.color, side: DoubleSide, transparent: true, depthTest: false }),
      );
      // The pawn passes over its own thread: it is the head, not one more node.
      mesh.renderOrder = 13;
      group.add(mesh);
    }
    return group;
  }

  /**
   * The width/height ratio is only known once the image is decoded; rather than a load
   * callback per pawn, we look at each orientation while it is missing.
   */
  private measureAspect(): void {
    if (this.aspectMeasured) return;
    const image = this.sprite?.material.map?.image as
      | { width?: number; height?: number }
      | undefined;
    if (!image?.width || !image.height) return;
    this.aspect = image.width / image.height;
    this.aspectMeasured = true;
  }
}
