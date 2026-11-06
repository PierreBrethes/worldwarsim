import { BOLLARDS, hasBollard, MOLE } from '@/emblems/kits/manifest';
import type { HullPost } from './timelines/rest';

/** A point, in the site's metres. */
export type P = { readonly x: number; readonly y: number; readonly z: number };
/** **A hull's four mooring marks** (`fx_amarre_{avant,arriere}_{babord,tribord}`), each end as
 *  `[babord, tribord]`: which flank touches the mole is read off the geometry, not off the names
 *  (a port in mirror, #476, turns it over). */
export type HullMarks = {
  readonly fore: readonly [P, P];
  readonly aft: readonly [P, P];
};
export type Line = { readonly from: P; readonly to: P };

/** **Four lines, one after the other from the stem** (storyboard `port`, `T = { lines: 0.3,
 *  line: 0.4 }`): each starts 0.3 s after the one before and runs 0.4 s. The hull is moored when
 *  the last is, 1.6 s after it touches; the lines are cast off from the stern in the same step
 *  and it is free at `RELEASE_MS`. */
const LINES = 4;
export const LINE_GAP_MS = 300;
export const LINE_MS = 400;
export const MOORING_MS = LINES * LINE_GAP_MS + LINE_MS;
export const RELEASE_MS = LINES * LINE_GAP_MS;
/** From the first line to the last one's end. */
export const RUN_MS = (LINES - 1) * LINE_GAP_MS + LINE_MS;
/** How far along the hull a line's second end lies from its mark, so the two lines of one end
 *  fall on two bollards and do not lie as one (`commun/port.js`). `@a-mesurer` */
const SPRING_M = 18;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** **How far line `i` (0 the stem's first) has run**, 0 to 1, `ms` after the hull touches
 *  (`releasing`: after the order to cast off, 1 to 0). */
export function lineRun(i: number, ms: number, releasing: boolean): number {
  return releasing
    ? 1 - clamp01((ms - (LINES - 1 - i) * LINE_GAP_MS) / LINE_MS)
    : clamp01((ms - i * LINE_GAP_MS) / LINE_MS);
}

/** **The mole's bollards**, in `port.glb`'s metres: the tops of the ones `moleKit` leaves. */
export function bollardsOf(): P[] {
  const out: P[] = [];
  for (let k = 0; k < MOLE.length / MOLE.module; k++)
    if (hasBollard(k))
      out.push({
        x: MOLE.inner + BOLLARDS.inset,
        y: MOLE.lift + 0.5 + BOLLARDS.rise,
        z: MOLE.quay + MOLE.module / 2 + k * MOLE.module,
      });
  return out;
}

const apart = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const nearest = (of: P, among: ReadonlyArray<P>) =>
  Math.min(...among.map((each) => apart(of, each)));

/** The flank (0 babord, 1 tribord) whose marks lie nearest the anchors. */
const flankOf = (marks: HullMarks, anchors: ReadonlyArray<P>): 0 | 1 => {
  const gap = (f: 0 | 1) => nearest(marks.fore[f], anchors) + nearest(marks.aft[f], anchors);
  return gap(1) < gap(0) ? 1 : 0;
};

/**
 * **The four lines of a hull** (storyboard « Amarrage »): two from its stem and two from its
 * stern, on the flank nearest the `anchors` (the mole's bollards, or the rail of the hull it lies
 * beside); each goes to the anchor nearest the point `SPRING_M` along the hull from its mark, ahead
 * for the first of an end, astern for the second.
 */
export function mooringLines(marks: HullMarks, anchors: ReadonlyArray<P>): Line[] {
  const flank = flankOf(marks, anchors);
  const [fore, aft] = [marks.fore[flank], marks.aft[flank]];
  const along = Math.hypot(fore.x - aft.x, fore.z - aft.z) || 1;
  const ahead = { x: (fore.x - aft.x) / along, z: (fore.z - aft.z) / along };
  return Array.from({ length: LINES }, (_, i) => {
    const from = i < LINES / 2 ? fore : aft;
    const sign = i % 2 === 0 ? 1 : -1;
    const probe = {
      x: from.x + sign * SPRING_M * ahead.x,
      y: from.y,
      z: from.z + sign * SPRING_M * ahead.z,
    };
    const to = anchors.reduce((best, each) =>
      apart(probe, each) < apart(probe, best) ? each : best,
    );
    return { from, to };
  });
}

/**
 * **The lines of a hull that lies at the side of `beside`** (storyboard `commun/port.js`): straight
 * across, each from its mark to the point of the neighbour's near flank at the same station, two
 * from the stem and two from the stern.
 */
export function acrossLines(marks: HullMarks, beside: HullMarks): Line[] {
  const centre = mid(mid(marks.fore[0], marks.fore[1]), mid(marks.aft[0], marks.aft[1]));
  const gap = (f: 0 | 1) => apart(mid(beside.fore[f], beside.aft[f]), centre);
  const rail = gap(1) < gap(0) ? 1 : 0;
  const [a, b] = [beside.fore[rail], beside.aft[rail]];
  const own = flankOf(marks, [a, b]);
  const reach = (from: P): P => {
    const run = b.z - a.z || 1;
    const k = Math.min(1, Math.max(0, (from.z - a.z) / run));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: from.z };
  };
  return Array.from({ length: LINES }, (_, i) => {
    const from = (i < LINES / 2 ? marks.fore : marks.aft)[own];
    return { from, to: reach(from) };
  });
}

/** **A post with hawsers**: the mole and its side; the roads have an anchor. */
export const isLined = (post: HullPost | null): post is 'mole' | 'couple' =>
  post === 'mole' || post === 'couple';

/**
 * **When a hull casts off, and how long it waits for it** (storyboard « Largue »): its lines come
 * aboard from `since + lead`, and it backs out `RELEASE_MS` after that. A hull with no hawsers
 * leaves as it did, and casts nothing off.
 */
export const departureOf = (
  post: HullPost | null,
  since: number,
  lead: number,
): { readonly wait: number; readonly castOff: number | null } =>
  isLined(post)
    ? { wait: lead + RELEASE_MS, castOff: since + lead }
    : { wait: lead, castOff: null };

/** **The instant a hull touches**, from its order and its approach in ms; `null` where it has no
 *  hawsers (the roads, no post). */
export const touchOf = (post: HullPost | null, since: number, ms: number): number | null =>
  isLined(post) ? since + ms : null;
