import { BoxGeometry, Color, Group, type Material, Mesh, MeshBasicMaterial } from 'three';
import { LANDING_CRAFT } from '@/emblems/kits/manifest';
import { PALETTE } from './palette';
import type { BargePlan } from './timelines/barge';

const DAY = new Color(PALETTE.border);
const NIGHT = new Color(PALETTE.paper);

type Laid = {
  readonly plan: Pick<BargePlan, 'craft' | 'size' | 'ms'>;
  readonly since: number;
  readonly body: Group;
  readonly ramp: Group;
};

/**
 * **The landing craft of a cargo that lands its first vehicle** (#511, storyboard `mer-air`): a
 * plain hull of ink, a floor with three walls and a bow ramp that falls, drawn while the plan that
 * laid it plays and gone with it. A stand-in for the files' `chaland` and `chaland_rampe`
 * (`LANDING_CRAFT`). Like the cables, no sequence, nothing laid: with the motion cut or a hull out
 * of the field, nothing is ever drawn.
 */
export class Barges {
  readonly group = new Group();
  private readonly material = new MeshBasicMaterial({ color: DAY });
  private readonly laid = new Map<string, Laid>();

  /** A craft is out, so the map asks for its images. */
  get active(): boolean {
    return this.laid.size > 0;
  }

  /** Lays the craft of `hull` from `since` (ms). */
  lay(hull: string, plan: Pick<BargePlan, 'craft' | 'size' | 'ms'>, since: number): void {
    this.clear(hull);
    const { length, width, depth, floor, ramp } = plan.size;
    const wall = width * LANDING_CRAFT.wall;
    const body = new Group();
    const piece = (
      [w, h, l]: readonly [number, number, number],
      at: readonly [number, number, number],
    ): Mesh => {
      const mesh = new Mesh(new BoxGeometry(w, h, l), this.material);
      mesh.position.set(...at);
      body.add(mesh);
      return mesh;
    };
    piece([width, floor, length], [0, floor / 2, 0]);
    for (const side of [-1, 1])
      piece([wall, depth - floor, length], [side * (width / 2 - wall / 2), (depth + floor) / 2, 0]);
    piece([width, depth - floor, wall], [0, (depth + floor) / 2, -length / 2 + wall / 2]);
    // The ramp is hinged at the bow, standing up when raised, and falls forward.
    const hinge = new Group();
    hinge.position.set(0, floor, length / 2);
    const plank = new Mesh(new BoxGeometry(width * LANDING_CRAFT.rampWidth, ramp, wall), this.material);
    plank.position.y = ramp / 2;
    hinge.add(plank);
    body.add(hinge);
    body.visible = false;
    body.frustumCulled = false;
    this.group.add(body);
    this.laid.set(hull, { plan, since, body, ramp: hinge });
  }

  clear(hull: string): void {
    const laid = this.laid.get(hull);
    if (laid === undefined) return;
    this.group.remove(laid.body);
    laid.body.traverse((node) => (node as Mesh).geometry?.dispose());
    this.laid.delete(hull);
  }

  /** Places each craft at `now`; `night` is the night's share, 0 to 1. */
  update(now: number, night: number): void {
    this.material.color.lerpColors(DAY, NIGHT, Math.min(1, Math.max(0, night)));
    for (const [hull, { plan, since, body, ramp }] of [...this.laid]) {
      const at = plan.craft(now - since);
      if (at === null) {
        if (now - since >= plan.ms) this.clear(hull);
        else body.visible = false;
        continue;
      }
      body.visible = true;
      body.position.copy(at.at);
      body.rotation.y = at.heading;
      ramp.rotation.x = at.ramp * LANDING_CRAFT.down;
    }
  }

  dispose(): void {
    for (const hull of [...this.laid.keys()]) this.clear(hull);
    (this.material as Material).dispose();
  }
}
