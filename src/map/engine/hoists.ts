import { Group, type Vector3 } from 'three';
import { Span } from './span';

/** **A cable's and a hook's width**, in the hull's metres, and the least they are drawn at, in
 *  screen pixels (like the hawsers and the plank, they do not melt away at a distance).
 *  `@a-mesurer` */
const CABLE_M = 0.12;
const HOOK_M = 0.5;
const CABLE_PX = 2;
const HOOK_PX = 4;

export type Strokes = (t: number) => ReadonlyArray<{
  readonly a: Vector3;
  readonly b: Vector3;
  readonly thick: boolean;
}>;

type Laid = {
  readonly strokes: Strokes;
  readonly since: number;
  readonly until: number;
  readonly metre: number;
};

/**
 * **The cables and hooks of the masts that lift** (#505, storyboard `mer-air`): strokes of ink
 * from a mast's tip to its hook and from the hook to the load, drawn while the lift that laid
 * them plays and gone with it. Like the plank, no sequence, nothing laid: with the motion cut or a
 * hull out of the field, nothing is ever drawn.
 */
export class Hoists {
  readonly group = new Group();
  private readonly spans: Span[] = [];
  private readonly laid = new Map<string, Laid>();

  /** A lift is out, so the map asks for its images. */
  get active(): boolean {
    return this.laid.size > 0;
  }

  /** Lays the strokes of `hull` from `since` to `until` (ms); `metre` the board's units to a
   *  metre of the hull. */
  lay(hull: string, strokes: Strokes, since: number, until: number, metre: number): void {
    this.laid.set(hull, { strokes, since, until, metre });
  }

  clear(hull: string): void {
    this.laid.delete(hull);
  }

  /** Draws the strokes at `now`; `unitsPerPixel` the board's units to a screen pixel. */
  update(now: number, unitsPerPixel: number, night: number): void {
    let used = 0;
    for (const [hull, { strokes, since, until, metre }] of this.laid) {
      const t = now - since;
      if (t >= until - since) {
        this.laid.delete(hull);
        continue;
      }
      for (const { a, b, thick } of strokes(t)) {
        let span = this.spans[used];
        if (span === undefined) {
          span = new Span();
          this.spans.push(span);
          this.group.add(span.mesh);
        }
        used++;
        const width = thick
          ? Math.max(HOOK_M * metre, HOOK_PX * unitsPerPixel)
          : Math.max(CABLE_M * metre, CABLE_PX * unitsPerPixel);
        span.set(a, b, width);
        span.setNight(night);
      }
    }
    for (let k = used; k < this.spans.length; k++) this.spans[k]!.clear();
  }

  dispose(): void {
    for (const span of this.spans) span.material.dispose();
  }
}
