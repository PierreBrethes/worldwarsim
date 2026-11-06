import { Group, type Object3D, Vector3 } from 'three';
import type { HullPost } from './timelines/rest';
import { markOf } from './figurines/marks';
import {
  bollardsOf,
  type HullMarks,
  type Line,
  lineRun,
  MOORING_MS,
  mooringLines,
  type P,
  railOf,
  RUN_MS,
} from './mooring';
import { Span } from './span';

/** A hull that lies at the mole or at its side: the model drawn, the troop and the site it rests at. */
export type MooredHull = {
  readonly id: string;
  readonly troop: string;
  readonly site: string;
  readonly post: Exclude<HullPost, 'roads'>;
  readonly object: Object3D;
};
/** A site's frame on the board, and its metre on it. */
export type MooringFrame = {
  toBoard(point: Vector3): Vector3;
  toModel(point: Vector3): Vector3;
  readonly metre: number;
};
export type MooringHost = {
  hulls(): ReadonlyArray<MooredHull>;
  frameOf(site: string): MooringFrame | null;
};

/** **How long an order waits for its sequence** before the lines stand at rest after all. */
const PENDING_MS = 2500;
/** How long the lines of a hull no longer drawn are kept for its cast off (`standing`'s `SEEN_MS`). */
const KEPT_MS = 10000;
/** **A hawser's width**, in metres. `@a-mesurer` */
const WIDTH_M = 0.4;
const NAMES = [
  ['fx_amarre_avant_babord', 'fx_amarre_avant_tribord'],
  ['fx_amarre_arriere_babord', 'fx_amarre_arriere_tribord'],
] as const;

type Drawn = { readonly from: Vector3; readonly to: Vector3; readonly width: number };

/**
 * **The mooring lines of the hulls at a port** (#500, storyboard `port` « Amarrage », « Largue »):
 * from the stem and stern marks of each hull to the mole's bollards, or, for the hull at the mole's
 * side, to the rail of the one at the mole. They are part of a hull's rest: drawn whatever the
 * motion setting and on a view loaded cold. Only an order plays them: `dock` runs them from the
 * instant the hull touches (`pending` holds them back until then), `release` casts them off, from
 * the lines the hull last stood with, before it leaves.
 */
export class Moorings {
  readonly group = new Group();
  private readonly spans: Span[] = [];
  /** By hull: when it touches (`Infinity` while its order waits for a sequence), and the instant
   *  after which the wait is over. */
  private readonly docking = new Map<string, { touch: number; stale: number }>();
  /** By troop: when its lines are cast off. */
  private readonly releasing = new Map<string, number>();
  /** By troop: the lines it last stood with, on the board. */
  private readonly kept = new Map<string, { lines: Drawn[]; seen: number }>();
  private night = 0;
  private running = false;

  constructor(private readonly host: MooringHost) {}

  /** A line is still running, so the map asks for its images. */
  get active(): boolean {
    return this.running;
  }

  /** **A hull's order is on its way**: its lines stay out until `dock` or `settle`. */
  pending(id: string, now: number): void {
    this.docking.set(id, { touch: Infinity, stale: now + PENDING_MS });
  }

  /** The hull touches at `touch`: its lines run from then. */
  dock(id: string, touch: number): void {
    this.docking.set(id, { touch, stale: Infinity });
  }

  /** The order plays nothing for this hull: its lines stand at rest. */
  settle(id: string): void {
    this.docking.delete(id);
  }

  /** The hull of `troop` casts off at `at`. */
  release(troop: string, at: number): void {
    this.releasing.set(troop, at);
  }

  /** The hull at the mole's side of `site` casts off at `at`, with the one it lay against. */
  releaseBeside(site: string, at: number): void {
    for (const hull of this.host.hulls())
      if (hull.site === site && hull.post === 'couple') this.release(hull.troop, at);
  }

  setNight(night: number): void {
    this.night = night;
    for (const span of this.spans) span.setNight(night);
  }

  /** The marks of a hull as drawn, in its site's metres; `null` while its model has none. */
  private marksOf(object: Object3D, frame: MooringFrame): HullMarks | null {
    const at = (name: string): P | null => {
      const mark = markOf(object, name);
      if (mark === null) return null;
      const { x, y, z } = frame.toModel(mark);
      return { x, y, z };
    };
    const [fore, aft] = NAMES.map((pair) => pair.map(at));
    return fore!.every((p) => p !== null) && aft!.every((p) => p !== null)
      ? ({ fore, aft } as unknown as HullMarks)
      : null;
  }

  private toBoard(frame: MooringFrame, { from, to }: Line): Drawn {
    const board = (p: P) => frame.toBoard(new Vector3(p.x, p.y, p.z));
    return { from: board(from), to: board(to), width: WIDTH_M * frame.metre };
  }

  /** **Draws the lines of this frame**; `on` off (a theatre), none. */
  update(now: number, on = true): void {
    let used = 0;
    const draw = (line: Drawn, progress: number) => {
      if (progress <= 0) return;
      let span = this.spans[used];
      if (span === undefined) {
        span = new Span();
        span.setNight(this.night);
        this.spans.push(span);
        this.group.add(span.mesh);
      }
      used++;
      span.set(line.from, line.from.clone().lerp(line.to, progress), line.width);
    };
    let running = false;
    for (const [id, { touch, stale }] of this.docking)
      if (now >= stale || now >= touch + MOORING_MS) this.docking.delete(id);
    const frames = new Map<string, MooringFrame | null>();
    const frameOf = (site: string) => {
      if (!frames.has(site)) frames.set(site, this.host.frameOf(site));
      return frames.get(site)!;
    };
    const hulls = on ? this.host.hulls() : [];
    const marked = new Map<string, HullMarks | null>();
    for (const hull of hulls) {
      const frame = frameOf(hull.site);
      marked.set(hull.id, frame === null ? null : this.marksOf(hull.object, frame));
    }
    for (const hull of hulls) {
      const [frame, marks] = [frameOf(hull.site), marked.get(hull.id)];
      if (frame === null || marks === undefined || marks === null) continue;
      const against =
        hull.post === 'mole'
          ? bollardsOf()
          : (() => {
              const mole = hulls.find((each) => each.site === hull.site && each.post === 'mole');
              const beside = mole === undefined ? null : marked.get(mole.id);
              return beside === null || beside === undefined ? [] : railOf(marks, beside);
            })();
      if (against.length === 0) continue;
      const lines = mooringLines(marks, against).map((line) => this.toBoard(frame, line));
      const order = this.docking.get(hull.id);
      // Stood still, its lines are what a cast off lets go of.
      if (order === undefined) this.kept.set(hull.troop, { lines, seen: now });
      lines.forEach((line, i) =>
        draw(line, order === undefined ? 1 : lineRun(i, now - order.touch, false)),
      );
      if (order !== undefined && order.touch !== Infinity) running = true;
    }
    if (on)
      for (const [troop, at] of this.releasing) {
        const kept = this.kept.get(troop);
        if (kept === undefined || now - at >= RUN_MS) {
          this.releasing.delete(troop);
          this.kept.delete(troop);
          continue;
        }
        kept.seen = now;
        kept.lines.forEach((line, i) => draw(line, lineRun(i, now - at, true)));
        running = true;
      }
    else this.releasing.clear();
    for (const [troop, { seen }] of this.kept) if (now - seen > KEPT_MS) this.kept.delete(troop);
    for (let k = used; k < this.spans.length; k++) this.spans[k]!.clear();
    this.running = running;
  }

  dispose(): void {
    for (const span of this.spans) span.material.dispose();
  }
}
