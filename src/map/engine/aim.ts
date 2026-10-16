import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { ARC_COLORS } from './palette';
import { dashPitch, Ribbon, RibbonMaterial, ribbonWidth } from './route-ribbon';

/** What the drop would do, as the hand reads it (`DropHint`'s tone): the ink of the road. */
export type AimTone = 'order' | 'fight' | 'refused';

/** The prototype's preview road (`ribbon({ width: .22, dash: .7, flow: 2.2 })`) in our units:
 *  its piece is some three times ours (`PROTOTYPE_UNIT` in `standing.ts`). */
const WIDTH = 0.066;
const FLOOR_PX = 3.5;
/** Its dashes run 2.2 units a second over a 0.7 dash: some three pitches a second. */
const PITCHES_PER_SECOND = 3.1;
/** Its arrow past the last point: as wide as 1.9 widths each side, 3.6 widths long. */
const ARROW = new BufferGeometry();
ARROW.setAttribute('position', new Float32BufferAttribute([-1.9, 0, 0, 1.9, 0, 0, 0, 0, 3.6], 3));
const LIFT = 0.012;

const INK: Readonly<Record<AimTone, { color: string; opacity: number }>> = {
  order: { color: ARC_COLORS.mine.trace, opacity: 0.95 },
  fight: { color: ARC_COLORS.enemyDetected.progress, opacity: 0.95 },
  // The prototype's refusal: a faint red line from home to where it was held.
  refused: { color: ARC_COLORS.enemyDetected.progress, opacity: 0.5 },
};

/**
 * **The road the piece in hand would take** (POC « Manipuler les pions », `previews`): a flat
 * ochre band on the sheet, its dashes flowing forward, an arrow at its end — red to a fight,
 * faint red and straight to where the hand is when the drop is refused. The server's route once the pointer rests,
 * a straight line from home until then.
 */
export class AimRibbon {
  readonly group = new Group();
  private readonly material = new RibbonMaterial({
    width: WIDTH,
    floorPx: FLOOR_PX,
    covered: INK.order,
    remaining: INK.order,
    dashed: true,
  });
  private readonly arrowMaterial = new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly arrow = new Mesh(ARROW, this.arrowMaterial);
  private ribbon: Ribbon | null = null;
  private key = '';

  constructor() {
    this.arrow.renderOrder = 6;
    this.group.add(this.arrow);
    this.group.visible = false;
  }

  /** The road to draw, `null` to draw none. Only a new road rebuilds the band. */
  show(points: ReadonlyArray<Vector3> | null, tone: AimTone): void {
    if (points === null || points.length < 2) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const ink = INK[tone];
    this.material.uniforms.remainingColor!.value.set(ink.color);
    this.material.remainingOpacity = ink.opacity;
    this.arrowMaterial.color.set(ink.color);
    this.arrowMaterial.opacity = ink.opacity;
    const lifted = points.map((point) => new Vector3(point.x, point.y + LIFT, point.z));
    const key = lifted.map((point) => `${point.x.toFixed(4)},${point.z.toFixed(4)}`).join(';');
    if (key === this.key) return;
    this.key = key;
    if (this.ribbon !== null) {
      this.ribbon.geometry.dispose();
      this.ribbon.removeFromParent();
    }
    this.ribbon = new Ribbon(lifted, this.material);
    this.ribbon.renderOrder = 6;
    this.ribbon.frustumCulled = false;
    this.group.add(this.ribbon);
    const last = lifted[lifted.length - 1]!;
    const before = lifted[lifted.length - 2]!;
    this.arrow.position.copy(last);
    this.arrow.rotation.set(0, Math.atan2(last.x - before.x, last.z - before.z), 0);
  }

  /** Its dashes flow while it is shown — `isFlowing` keeps the frames coming. */
  get isFlowing(): boolean {
    return this.group.visible;
  }

  animate(unitsPerPixel: number, screenHeight: number, seconds: number, flowing: boolean): void {
    if (!this.group.visible) return;
    const drawn = ribbonWidth(WIDTH, FLOOR_PX, unitsPerPixel);
    this.material.viewHeight = screenHeight;
    this.material.pitch = dashPitch(drawn);
    if (flowing) this.material.phase = (this.material.phase + seconds * PITCHES_PER_SECOND) % 1;
    this.arrow.scale.setScalar(drawn);
  }

  dispose(): void {
    this.ribbon?.geometry.dispose();
    this.material.dispose();
    this.arrowMaterial.dispose();
    this.group.removeFromParent();
  }
}
