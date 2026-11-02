import {
  Box3,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  SphereGeometry,
  type Sprite,
  Vector3,
} from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { VOLLEY_SHARE, type ReplayFrame } from '@/domain/replay';
import { GUNS, Guns, INDIRECT_ELEVATION, readyOf, recoilAt } from './articulation';
import { TANK_MODEL_UNITS } from './figurines/figurine';
import type { Flash } from './halo';
import { FIRING, flash, FLASH_MS, scaleWithin, sinceDeparture } from './replay';
import { dashPitch, Ribbon, RibbonMaterial, ribbonWidth } from './route-ribbon';
import { articulatedOf, type SequenceHost } from './sequences';
import { Smoke } from './smoke';

/** **How high the arc rises** over its middle, in shares of the chord: the storyboard's.
 *  @a-mesurer: 30 km high over 90 km reads as a shell's flight, not a bridge? */
export const ARC_RISE = 0.32;
const ARC_POINTS = 48;
/** The storyboard's ink and pen: a dark dashed line, 2.5 px at least, a dot at its head. */
const ARC_INK = '#2b2118';
const ARC_PX = 2.5;
const SHELL_PX = 3;
/** The muzzle flash, in shares of the gun's length (storyboard: a third of a tank's). */
const FLASH_SHARE = 0.33;
/** How far round a gun's flash lights the night, in its lengths. @a-mesurer */
const FLASH_REACH = 3;

/** **The arc's points**, from `from` to `to`, a parabola rising `ARC_RISE` of the chord. */
export function arcPoints(from: Vector3, to: Vector3): Vector3[] {
  const rise = ARC_RISE * from.distanceTo(to);
  return Array.from({ length: ARC_POINTS + 1 }, (_, k) => {
    const u = k / ARC_POINTS;
    return new Vector3()
      .lerpVectors(from, to, u)
      .setY(from.y + (to.y - from.y) * u + 4 * rise * u * (1 - u));
  });
}

/**
 * **How much of the arc shows at `frame`**, chez le tireur (storyboard, variante « arc d'encre ») :
 * traced over the shell's flight — the volley's share of the strike —, held whole to the end of
 * the strike, faded over the silent riposte. Reduced, whole on the held strike; cut, none.
 */
export function arcAt(
  frame: ReplayFrame,
  motion: MapMotion,
): { readonly drawn: number; readonly opacity: number } | null {
  if (motion === 'off') return null;
  if (frame.step === 'frappe' && frame.firing === 'mine')
    return {
      drawn: motion === 'reduced' ? 1 : Math.min(1, frame.progress / VOLLEY_SHARE),
      opacity: 1,
    };
  if (frame.step !== 'riposte' || frame.firing !== null || motion !== 'full') return null;
  return frame.progress < 1 ? { drawn: 1, opacity: 1 - frame.progress } : null;
}

/** **What lends the gun** (`StandingLayer`): its piles, and the gun in battery nearest a point. */
export type BatteryHost = Pick<SequenceHost, 'pieceOf' | 'standIn'> & {
  batteryNear(at: Vector3, within: number): string | null;
};

const SHELL = new SphereGeometry(1, 10, 8);
const turn = new Quaternion();
const toward = new Vector3();

/**
 * **Ma batterie au tir** (#325, ADR 0036 §5 précisée le 02/11) : sa pièce reste dans sa pile,
 * relayée le temps de la scène par une copie articulée à sa pose de repos — flèches ouvertes —,
 * menée par l'horloge du combat (`show`) : elle se tourne vers la cible, lève le tube à 35°,
 * recule au départ et éclaire sa bouche. L'arc d'encre part de cette bouche, ou du point de la
 * batterie quand sa pile n'est pas dessinée. Built only from `firedFrom`, which the target never has.
 */
export class BatteryShot {
  readonly object = new Group();
  private readonly ink = new RibbonMaterial({
    // A pen's line on screen, never a band of the board: at the gun's zoom a thread's true
    // width would stand as a wall.
    width: 0,
    floorPx: ARC_PX,
    covered: { color: ARC_INK, opacity: 1 },
    remaining: { color: ARC_INK, opacity: 1 },
    dashed: true,
  });
  private arc: Ribbon | null = null;
  private start: Vector3 | null = null;
  private readonly shell = new Mesh(SHELL, new MeshBasicMaterial({ color: ARC_INK }));
  private id: string | null = null;
  private gun: {
    readonly copy: Object3D;
    readonly guns: Guns;
    readonly length: number;
    readonly flash: Sprite;
    readonly smoke: Smoke;
  } | null = null;
  private salvo = 0;
  private over = false;
  private unitsPerPixel = 0;

  constructor(
    /** The battery's place on the board, and how near it a gun of mine must stand to be it. */
    private readonly from: Vector3,
    private readonly within: number,
    /** The target's point on the board. */
    private readonly to: Vector3,
    private readonly host: BatteryHost | null,
  ) {
    this.shell.visible = false;
    this.object.add(this.shell);
  }

  /** The pen's measures this frame: the dashes and the dot keep their size on screen. */
  scaleInk(unitsPerPixel: number, viewHeight: number): void {
    this.unitsPerPixel = unitsPerPixel;
    this.ink.viewHeight = viewHeight;
    this.ink.pitch = dashPitch(ribbonWidth(this.ink.width, this.ink.floorPx, unitsPerPixel));
  }

  /** Draws `frame`; `motion` is the setting, `plays` whether the combat plays or holds. */
  show(frame: ReplayFrame, motion: MapMotion, plays: boolean): void {
    if (plays && motion !== 'off') this.borrow();
    const still = motion !== 'full';
    const fires = frame.firing === 'mine';
    const since = fires && !still ? sinceDeparture(frame, 0) : null;
    this.salvo = !fires
      ? 0
      : still
        ? 1
        : since === null || since < 0 || since >= FLASH_MS
          ? 0
          : Math.sin((Math.PI * since) / FLASH_MS);
    const muzzle = this.aim(frame, still, since);
    this.trace(arcAt(frame, motion), muzzle ?? this.from);
  }

  /** The gun's flash, lighting the night (#332), `null` in the dark. */
  flashOf(): Flash | null {
    if (this.salvo <= 0.02 || this.gun === null) return null;
    const at = this.gun.flash.getWorldPosition(new Vector3());
    const scale = this.gun.copy.getWorldScale(new Vector3()).x;
    return { at, strength: this.salvo, reach: FLASH_REACH * this.gun.length * scale };
  }

  /** The piece goes back to its pile, the arc off the board. */
  dispose(): void {
    this.over = true;
    if (this.id !== null && this.gun !== null) this.host?.standIn(this.id, null);
    this.gun = null;
    this.arc?.geometry.dispose();
    this.ink.dispose();
    (this.shell.material as MeshBasicMaterial).dispose();
    this.object.removeFromParent();
  }

  /** Asks the host for the gun once its pile stands: a copy cooked at the piece's own pose. */
  private borrow(): void {
    if (this.id !== null || this.host === null) return;
    const id = this.host.batteryNear(this.from, this.within);
    const piece = id === null ? null : this.host.pieceOf(id);
    if (id === null || piece?.url === undefined) return;
    this.id = id;
    void articulatedOf(piece.url, 'artillery', piece.pose).then(
      (cooked) => {
        if (this.over || this.host?.pieceOf(id) === null) return;
        const copy = cooked.clone(true);
        copy.rotation.order = 'YXZ';
        const length = new Box3().setFromObject(copy).getSize(new Vector3()).z;
        const guns = new Guns(copy, 'artillery', null, INDIRECT_ELEVATION);
        const muzzle = guns.muzzles[0];
        if (muzzle === undefined) return;
        const within = scaleWithin(muzzle, copy);
        const sprite = flash();
        sprite.visible = false;
        sprite.scale.setScalar((FLASH_SHARE * length) / within);
        const smoke = new Smoke(FIRING);
        smoke.object.scale.setScalar(length / TANK_MODEL_UNITS / within);
        smoke.object.visible = false;
        muzzle.add(sprite, smoke.object);
        this.host?.standIn(id, copy);
        this.gun = { copy, guns, length, flash: sprite, smoke };
      },
      () => {},
    );
  }

  /** The copy turns to its target, raises its barrel, recoils; its muzzle in the world. */
  private aim(frame: ReplayFrame, still: boolean, since: number | null): Vector3 | null {
    const gun = this.gun;
    if (gun === null) return null;
    // A pile drawn again, or taken in hand, has taken the piece back.
    if (this.id === null || this.host?.pieceOf(this.id) === null) {
      this.gun = null;
      return null;
    }
    const { copy, guns, length } = gun;
    const ready = readyOf(frame);
    const parent = copy.parent;
    let yaw = 0;
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      toward.copy(this.to).sub(parent.getWorldPosition(new Vector3()));
      toward.applyQuaternion(parent.getWorldQuaternion(turn).invert());
      yaw = Math.atan2(toward.x, toward.z);
    }
    const recoil = still ? 0 : recoilAt(since);
    const { piece, rock } = GUNS.artillery;
    copy.rotation.set(((rock * Math.PI) / 180) * recoil, yaw * ready, 0);
    copy.position.set(
      -Math.sin(yaw * ready) * piece * length * recoil,
      0,
      -Math.cos(yaw * ready) * piece * length * recoil,
    );
    guns.point(0, ready, ready, () => recoil);
    gun.flash.visible = this.salvo > 0.02;
    gun.flash.scale.setScalar(
      ((FLASH_SHARE * length) / scaleWithin(guns.muzzles[0]!, copy)) * Math.max(this.salvo, 0.02),
    );
    const puffing = frame.firing === 'mine' && (still || (since !== null && since >= 0));
    gun.smoke.object.visible = puffing;
    if (puffing) gun.smoke.frame(still ? 0.4 : since! / 1000 + 0.03, fadeOf(frame));
    copy.updateMatrixWorld(true);
    return guns.muzzles[0]!.getWorldPosition(new Vector3());
  }

  /** The arc from `start` to the target, drawn to its share, the shell at its head in flight. */
  private trace(
    shown: { readonly drawn: number; readonly opacity: number } | null,
    start: Vector3,
  ): void {
    if (shown === null) {
      if (this.arc !== null) this.arc.visible = false;
      this.shell.visible = false;
      return;
    }
    if (this.start === null || this.start.distanceTo(start) > 1e-3 * start.distanceTo(this.to)) {
      this.start = start.clone();
      this.arc?.removeFromParent();
      this.arc?.geometry.dispose();
      this.arc = new Ribbon(arcPoints(start, this.to), this.ink);
      this.arc.frustumCulled = false;
      this.arc.renderOrder = 12.4;
      this.object.add(this.arc);
    }
    const arc = this.arc!;
    arc.visible = true;
    const length = arc.geometry.getAttribute('along').array.at(-1) ?? 0;
    this.ink.end = shown.drawn * length;
    this.ink.remainingOpacity = shown.opacity;
    this.shell.visible = shown.drawn < 1;
    if (this.shell.visible) {
      const points = arc.vertices;
      this.shell.position.copy(points[Math.round(shown.drawn * (points.length - 1))]!);
      this.shell.scale.setScalar(SHELL_PX * this.unitsPerPixel);
    }
  }
}

/** The smoke of the shot thins out once the shell has landed, as a volley's does. */
const fadeOf = ({ step, progress }: ReplayFrame): number =>
  step === 'frappe' ? Math.min(1, (1 - progress) / (1 - VOLLEY_SHARE)) : 1;
