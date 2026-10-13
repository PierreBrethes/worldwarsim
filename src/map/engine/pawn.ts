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
import type { MediumSprites } from '@/emblems/units/manifest';
import { faceCamera, textureOf } from './billboard';
import { nearWeight, type Figurine } from './figurines/figurine';
import { PLATE_WIDTH, SILHOUETTES } from './silhouettes';
import { Wake } from './smoke';

/**
 * A share of the camera distance: a pawn keeps its size on screen. At a fixed world size it
 * is a dust speck in orbit and covers the North Sea up close. The silhouette is narrower
 * than the sprite it replaces, but solid: at equal size it weighs more to the eye, and
 * eight movements out of the same port would make a blot.
 *
 * **It is a side, not a height** (see `orient`): the plates are not drawn to one frame — a
 * bomber is twice as wide as it is tall, a rifleman half. Scaling them all to the same height
 * gave every wing a generous span and left the infantry a sliver, the one plate a player looks
 * for most. The share now sets the square each plate covers, so the eye weighs them the same
 * whatever their shape.
 */
const PAWN_SHARE = 0.031;
const PAWN_SILHOUETTE_SHARE = 0.018;

/** A drawn costume and what its scaling needs: the ratio is only known once decoded. */
type SpriteCostume = {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  aspect: number;
  measured: boolean;
};

/**
 * A movement's pawn: a single piece over the whole route, changing costume at the dock and
 * standing still during the transfer.
 *
 * **Each medium wears its own plate**, and each is read on the units that actually cross it
 * (`movementSprites`): the boots on the road, the hull that ferries them, the wing that lifts
 * them. Embarked infantry still travels on a ship rather than on foot — that rule moved into
 * the manifest, where the stack is, instead of being enforced here by showing nothing.
 *
 * A medium with no plate keeps the anonymous silhouette, and so does every enemy arc: the
 * manifest hands back `null` throughout for one (the fog leaves it no stack to read), so no
 * display `if` here can leak a role.
 *
 * **Close to the board a medium wears its figurine instead** (ADR 0026 §3), when it has one:
 * the plate shrinks away as the figurine grows from the ground, both by `nearWeight`. The
 * plate turns to face the eye; the figurine stands on the board and faces its road.
 */
export class Pawn {
  readonly object = new Group();
  private readonly costumes = new Map<Medium, Group>();
  private readonly sprites = new Map<Medium, SpriteCostume>();
  private readonly figurines = new Map<Medium, Figurine>();
  private readonly color: string;
  private readonly wake = new Wake();
  private medium: Medium = 'land';
  private westward = false;
  private heading = 0;
  /** The effects' clock: it only runs while `step` is called, so reduced motion stills them. */
  private clock = 0;

  constructor(
    sprites: MediumSprites | null,
    color: string,
    figurines: Readonly<Record<Medium, Figurine | null>> | null = null,
  ) {
    this.color = color;
    for (const medium of ['land', 'sea', 'air'] as const) {
      const url = sprites?.[medium] ?? null;
      const costume = url === null ? this.buildSilhouette(medium) : this.buildSprite(medium, url);
      costume.visible = medium === this.medium;
      this.costumes.set(medium, costume);
      this.object.add(costume);
      const figurine = figurines?.[medium] ?? null;
      if (figurine !== null) {
        figurine.object.visible = false;
        this.figurines.set(medium, figurine);
        this.object.add(figurine.object);
      }
    }
    this.wake.object.name = 'wake';
    this.wake.object.visible = false;
    this.object.add(this.wake.object);
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
    const leavingFigurine = this.figurines.get(this.medium);
    if (leavingFigurine) leavingFigurine.object.visible = false;
    this.medium = medium;
    const entering = this.costumes.get(medium);
    if (entering) entering.visible = true;
  }

  place(position: Vector3, pointAhead: Vector3): void {
    this.object.position.copy(position);
    this.westward = pointAhead.x < position.x;
    const dx = pointAhead.x - position.x;
    const dz = pointAhead.z - position.z;
    // At the end of its thread the point ahead is the point itself: the piece keeps the road it came by.
    if (dx !== 0 || dz !== 0) this.heading = Math.atan2(dx, dz);
  }

  /** What spins on the worn figurine — its propellers — and nothing else. */
  step(elapsedSeconds: number): void {
    this.figurines.get(this.medium)?.spin(elapsedSeconds);
    this.clock += elapsedSeconds;
    if (this.wake.object.visible) this.wake.frame(this.clock);
  }

  /**
   * The size is carried by the costume, not by `object`: the sprite and the silhouette have
   * neither the same screen share nor the same frame — one hangs under its point, the other
   * stands on it — and a common scale would make the pawn's size jump at the dock.
   */
  orient(cameraPosition: Vector3, yaw: number): void {
    const distance = this.object.position.distanceTo(cameraPosition);
    const close = nearWeight(distance);
    // Figurine or silhouette, a hull at sea up close stirs the water: the wake says « at sea ».
    this.wake.object.visible = this.medium === 'sea' && close > 0;
    this.wake.object.rotation.set(0, this.heading, 0);
    this.wake.object.scale.setScalar(close);
    const figurine = this.figurines.get(this.medium);
    const near = figurine === undefined ? 0 : close;
    if (figurine !== undefined) {
      figurine.object.visible = near > 0;
      figurine.object.rotation.set(0, figurine.facesEye ? yaw : this.heading, 0);
      figurine.object.scale.setScalar(near);
    }
    const costume = this.costumes.get(this.medium);
    if (costume === undefined) return;
    costume.visible = near < 1;
    faceCamera(costume, cameraPosition, this.object.position);
    const sign = this.westward ? -1 : 1;
    const far = 1 - near;
    const worn = this.sprites.get(this.medium);
    if (worn !== undefined) {
      measureAspect(worn);
      /** Equal area rather than equal height: the side of the square the plate is worth,
       *  stretched into its own ratio. A wide plate keeps its span, a tall one its stature. */
      const side = distance * PAWN_SHARE * far;
      const height = side / Math.sqrt(worn.aspect);
      worn.mesh.scale.set(worn.aspect * height * sign, height, 1);
      return;
    }
    const size = distance * PAWN_SILHOUETTE_SHARE * far;
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
  private buildSprite(medium: Medium, url: string): Group {
    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        map: textureOf(url),
        transparent: true,
        alphaTest: 0.35,
        side: DoubleSide,
        /** Tipped flat under a vertical camera, the plate lies **in** the board's own plane
         *  and would fight it for every pixel. It is the head of a movement and passes over
         *  its thread already: it passes over the ground too, like the silhouettes. */
        depthTest: false,
      }),
    );
    mesh.renderOrder = 13;
    this.sprites.set(medium, { mesh, aspect: 1, measured: false });
    const group = new Group();
    group.add(mesh);
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
        new MeshBasicMaterial({
          color: this.color,
          side: DoubleSide,
          transparent: true,
          depthTest: false,
        }),
      );
      // The pawn passes over its own thread: it is the head, not one more node.
      mesh.renderOrder = 13;
      group.add(mesh);
    }
    return group;
  }
}

/**
 * The width/height ratio is only known once the image is decoded; rather than a load callback
 * per pawn, we look at each orientation while it is missing.
 */
function measureAspect(costume: SpriteCostume): void {
  if (costume.measured) return;
  const image = costume.mesh.material.map?.image as { width?: number; height?: number } | undefined;
  if (!image?.width || !image.height) return;
  costume.aspect = image.width / image.height;
  costume.measured = true;
}
