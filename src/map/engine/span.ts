import { BoxGeometry, Color, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import { PALETTE } from './palette';

const BAR = new BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const DAY = new Color(PALETTE.border);
const NIGHT = new Color(PALETTE.paper);

/**
 * **A stroke of ink between two points** (a gangway plank, a cable, a hook's sling): a bar laid
 * from `a` to `b`, not a piece of a model. It shows only while a sequence sets it; the sequences
 * play nothing with the motion off, so it is never set there, and a lasting line may draw in every mode. Its ink lightens with the night, as a dark ink on a
 * dark ground would be lost (`TourInk`'s casing).
 */
export class Span {
  readonly material = new MeshBasicMaterial({ color: DAY });
  readonly mesh = new Mesh(BAR, this.material);

  constructor() {
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  /** `width` across, `thick` deep (a cable is as thick as wide; a plank is not). */
  set(a: Vector3, b: Vector3, width: number, thick = width): void {
    this.mesh.position.copy(a);
    this.mesh.scale.set(width, thick, Math.max(1e-5, a.distanceTo(b)));
    this.mesh.lookAt(b);
    this.mesh.visible = true;
  }

  clear(): void {
    this.mesh.visible = false;
  }

  /** The night's share, 0 to 1. */
  setNight(night: number): void {
    this.material.color.lerpColors(DAY, NIGHT, Math.min(1, Math.max(0, night)));
  }
}
