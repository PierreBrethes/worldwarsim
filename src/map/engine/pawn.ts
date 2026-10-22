import { DoubleSide, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from 'three';
import type { Wear } from '@/domain/pile-pieces';
import type { UnitRole } from '@/domain/ids';
import type { Medium } from '@/domain/routing';
import { faceCamera } from './billboard';
import { altitudeShadow, FIGURINE_SCALE, nearWeight, type Figurine } from './figurines/figurine';
import { PLATE_WIDTH, SILHOUETTES } from './silhouettes';
import { PLUME_BY_WEAR, Smoke, Wake, type Plume } from './smoke';
import { gaitOf, swayOf, type Gait } from './sway';
import { blacken } from './standing';
import { pieceScale } from './piece-scale';
import { releaseInk } from './annotations';

/** A share of the camera distance: the silhouette keeps its size on screen. */
const PAWN_SILHOUETTE_SHARE = 0.018;

/** Below this gap a plane is on the ground: a shadow glued under it would say nothing. */
const AIRBORNE_GAP = 0.05;

/**
 * **The dust a vehicle raises on the road** (`table-etat-major.html`, `dust`): low, short-lived,
 * thrown back behind it. In model units, from the rear of a tank 2.6 long.
 */
const DUST: Plume = {
  puffs: 7,
  life: 1.1,
  rise: 0.55,
  lean: 3.6,
  size: [0.5, 1.6],
  opacity: 0.5,
  color: '#b9a684',
};
const DUST_REAR = 1.1;

/**
 * A movement's pawn: a single piece over the whole route, changing costume at the dock and
 * standing still during the transfer.
 *
 * **Up close each medium wears its figurine** (ADR 0026 §3), grown from the ground by
 * `nearWeight`; a medium with none wears the anonymous silhouette in its place. **Far away the
 * pawn is gone**: the movement's pin stands at its head (#234, `pins.ts`).
 */
export class Pawn {
  readonly object = new Group();
  private readonly costumes = new Map<Medium, Group>();
  private readonly figurines = new Map<Medium, Figurine>();
  private readonly color: string;
  private readonly smokes = new Map<Medium, Smoke>();
  private readonly gaits = new Map<Medium, Gait>();
  /** Raised by a vehicle that rolls on land, `null` for any other piece. */
  private dust: Smoke | null = null;
  /** Its road bends here — positive to the left —, and it has gone forward since the last frame. */
  private turn = 0;
  private moving = false;
  /** Full motion only: reduced and cut motion leave every piece upright and the road clear. */
  private lively = false;
  private readonly wake = new Wake();
  private readonly shadow = altitudeShadow();
  /** Height of the ground under the pawn, relative to it: zero, or below a plane. */
  private groundBelow = 0;
  private medium: Medium = 'land';
  private westward = false;
  private heading = 0;
  /** The effects' clock: it only runs while `step` is called, so reduced motion stills them. */
  private clock = 0;

  constructor(
    color: string,
    figurines: Readonly<Record<Medium, Figurine | null>> | null = null,
    /** My movement's wear per medium (`movementWear`); `null` for anything not mine. */
    wear: Readonly<Record<Medium, Wear>> | null = null,
    /** My movement's roles per medium (`movementRoles`), what says how each rides; `null` for
     *  anything not mine — an enemy block neither jolts nor banks. */
    roles: Readonly<Record<Medium, UnitRole | null>> | null = null,
  ) {
    this.color = color;
    for (const medium of ['land', 'sea', 'air'] as const) {
      const figurine = figurines?.[medium] ?? null;
      if (figurine === null) {
        const costume = this.buildSilhouette(medium);
        costume.visible = medium === this.medium;
        this.costumes.set(medium, costume);
        this.object.add(costume);
      } else {
        figurine.object.visible = false;
        this.figurines.set(medium, figurine);
        this.object.add(figurine.object);
        figurine.object.rotation.order = 'YXZ';
        const gait = gaitOf(roles?.[medium] ?? null);
        if (gait !== null) this.gaits.set(medium, gait);
        if (gait === 'rolling') {
          this.dust = new Smoke(DUST);
          this.dust.object.scale.setScalar(FIGURINE_SCALE);
          this.dust.object.position.set(0, 0.1 * FIGURINE_SCALE, -DUST_REAR * FIGURINE_SCALE);
          // A puff leans along its +x: turned, it is thrown back behind the vehicle.
          this.dust.object.rotation.y = Math.PI / 2;
          this.dust.object.visible = false;
          figurine.object.add(this.dust.object);
        }
        const worn = wear?.[medium] ?? 'whole';
        const plume = PLUME_BY_WEAR[worn];
        if (plume !== null) {
          // A worn vehicle on the move smokes as it does standing (ADR 0026 §5).
          const smoke = new Smoke(plume);
          this.smokes.set(medium, smoke);
          void figurine.ready.then(
            () => {
              figurine.object.getObjectByName('fx_smoke')?.add(smoke.object);
              if (worn === 'burning') blacken(figurine.object);
            },
            () => {},
          );
        }
      }
    }
    this.wake.object.name = 'wake';
    this.wake.object.visible = false;
    this.object.add(this.wake.object);
    this.shadow.name = 'shadow';
    this.shadow.visible = false;
    this.object.add(this.shadow);
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

  /** `groundY` is the board's height under the point: a plane flies above it (`flightAltitude`). */
  place(position: Vector3, pointAhead: Vector3, groundY = position.y, turn = 0): void {
    this.moving = !position.equals(this.object.position);
    this.turn = turn;
    this.object.position.copy(position);
    this.groundBelow = groundY - position.y;
    this.westward = pointAhead.x < position.x;
    const dx = pointAhead.x - position.x;
    const dz = pointAhead.z - position.z;
    // At the end of its thread the point ahead is the point itself: the piece keeps the road it came by.
    if (dx !== 0 || dz !== 0) this.heading = Math.atan2(dx, dz);
  }

  /** What spins, sways and smokes on the worn figurine; `null` is motion not full — all still. */
  step(elapsedSeconds: number | null): void {
    this.lively = elapsedSeconds !== null;
    if (elapsedSeconds === null) return;
    this.figurines.get(this.medium)?.spin(elapsedSeconds);
    this.clock += elapsedSeconds;
    if (this.wake.object.visible) this.wake.frame(this.clock);
    this.smokes.get(this.medium)?.frame(this.clock);
    if (this.dust?.object.visible) this.dust.frame(this.clock);
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
    this.wake.object.scale.setScalar(close * pieceScale.troops);
    // The gap between a plane and its shadow is its altitude: it opens at take-off and closes on landing.
    this.shadow.visible = this.medium === 'air' && close > 0 && -this.groundBelow > AIRBORNE_GAP;
    this.shadow.position.y = this.groundBelow;
    this.shadow.scale.setScalar(close * pieceScale.troops);
    const figurine = this.figurines.get(this.medium);
    const near = figurine === undefined ? 0 : close;
    if (figurine !== undefined) {
      figurine.object.visible = near > 0;
      const scale = near * pieceScale.troops;
      const sway = swayOf(
        this.lively ? (this.gaits.get(this.medium) ?? null) : null,
        this.clock,
        this.moving,
        this.turn,
      );
      figurine.object.rotation.set(sway.pitch, figurine.facesEye ? yaw : this.heading, sway.roll);
      figurine.object.position.y = sway.lift * FIGURINE_SCALE * scale;
      figurine.object.scale.setScalar(scale);
      if (this.dust !== null)
        this.dust.object.visible =
          this.lively && this.moving && this.gaits.get(this.medium) === 'rolling';
    }
    // A medium with no figurine wears its silhouette in its place, up close only: far away
    // the pin is the piece (#234).
    const costume = this.costumes.get(this.medium);
    if (costume === undefined) return;
    costume.visible = close > 0;
    faceCamera(costume, cameraPosition, this.object.position);
    const size = distance * PAWN_SILHOUETTE_SHARE * close;
    costume.scale.set(size * (this.westward ? -1 : 1), size, size);
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const figurine of this.figurines.values()) releaseInk(figurine.object);
    for (const costume of this.costumes.values()) {
      for (const child of costume.children) {
        const mesh = child as Mesh<ShapeGeometry, MeshBasicMaterial>;
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
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
