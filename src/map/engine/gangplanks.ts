import { Group, type Vector3 } from 'three';
import { Span } from './span';
import { PLANK_MS, type Plank, plankAt } from './timelines/gangway';

/** **A plank's width and depth**, in metres, and the least it is drawn at, in screen pixels
 *  (like the hawsers, it does not melt away at a distance). `@a-mesurer` */
const WIDTH_M = 1.3;
const THICK_M = 0.25;
const WIDTH_PX = 2;
/** The plank swings from this share of its length above the door (storyboard `mer-air`). */
const RAISED = 0.9;

type Laid = {
  readonly door: Vector3;
  readonly foot: Vector3;
  readonly since: number;
  readonly plank: Plank;
  readonly metre: number;
};

/**
 * **The gangway planks of the hulls that are boarded** (#479): a stroke of ink from the hull's
 * door (`fx_passerelle`, a carrier's deck edge) to the mole's deck, laid by the sequence that sends the men up it and
 * gone with it. It is not part of any hull's rest: with no sequence — motion cut, a hull out of
 * the field — nothing is ever laid.
 */
export class Gangplanks {
  readonly group = new Group();
  private readonly spans: Span[] = [];
  private readonly laid = new Map<string, Laid>();

  /** A plank is out, so the map asks for its images. */
  get active(): boolean {
    return this.laid.size > 0;
  }

  /** Lays the plank of `hull` from `since` (ms), `metre` the board's units to a metre. */
  lay(
    hull: string,
    door: Vector3,
    foot: Vector3,
    since: number,
    plank: Plank,
    metre: number,
  ): void {
    this.laid.set(hull, { door, foot, since, plank, metre });
  }

  clear(hull: string): void {
    this.laid.delete(hull);
  }

  /** Draws the planks at `now`; `unitsPerPixel` the board's units to a screen pixel. */
  update(now: number, unitsPerPixel: number, night: number): void {
    let used = 0;
    for (const [hull, { door, foot, since, plank, metre }] of this.laid) {
      const t = now - since;
      if (t >= plank.up + PLANK_MS) {
        this.laid.delete(hull);
        continue;
      }
      const k = plankAt(t, plank);
      if (k <= 0.001) continue;
      let span = this.spans[used];
      if (span === undefined) {
        span = new Span();
        this.spans.push(span);
        this.group.add(span.mesh);
      }
      used++;
      const raised = door.clone().setY(door.y + door.distanceTo(foot) * RAISED);
      span.set(
        door,
        raised.lerp(foot, k),
        Math.max(WIDTH_M * metre, WIDTH_PX * unitsPerPixel),
        Math.max(THICK_M * metre, unitsPerPixel),
      );
      span.setNight(night);
    }
    for (let k = used; k < this.spans.length; k++) this.spans[k]!.clear();
  }

  dispose(): void {
    for (const span of this.spans) span.material.dispose();
  }
}
