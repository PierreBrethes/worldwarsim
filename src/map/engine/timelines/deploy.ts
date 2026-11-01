import { wrap } from '../articulation';
import { ease, span } from './curves';

type Flat = readonly [x: number, z: number];

/** **A piece of the file at the arrival** (#362): where the pawn left it and the way it faced,
 *  how far behind the head and to the right of the road it walked, and its own place in the pile
 *  at rest, on the board. */
export type FilePlace = {
  readonly from: Flat;
  readonly heading: number;
  readonly back: number;
  readonly side: number;
  readonly to: Flat;
  readonly infantry: boolean;
};

/** The file, the road it came by — from the head back —, and the span its pieces are drawn at on
 *  the board: the pace and the pile's step are in spans. */
export type DeployingFile = {
  readonly span: number;
  readonly road: ReadonlyArray<Flat>;
  readonly pieces: ReadonlyArray<FilePlace>;
};

/** **Between two pieces leaving the file** (storyboard de la marche, `STAGGER`). */
const STAGGER_MS = 160;
/** A piece's way lasts between these, like `PACE_BOUNDS` (`DEPLOY_BOUNDS`). */
const DEPLOY_BOUNDS = [1200, 2600] as const;
/** The pace of the deployment, in spans a second. `@a-mesurer` */
const SPANS_PER_S = 1.5;
/** **A pile's step** (`g` of the storyboard, `GAP_PER_LONGEST` of the file), in spans: a piece
 *  takes the road again up to this far from the point, then leaves it for its place. */
const STEP = 1.35;
/** The last quarter: the piece turns to the front (`TURN_FROM`). */
const TURN_FROM = 0.75;
/** Points on the curve from the road to the place. */
const CURVE_POINTS = 18;

type Way = { readonly points: ReadonlyArray<Flat>; readonly lengths: ReadonlyArray<number> };

/** The road `d` behind the head, and the way forward there (toward the head). */
function roadAt(road: ReadonlyArray<Flat>, d: number): { at: Flat; forward: Flat } {
  let walked = 0;
  for (let k = 0; k + 1 < road.length; k++) {
    const [a, b] = [road[k]!, road[k + 1]!];
    const leg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (leg > 0 && (walked + leg >= d || k + 2 === road.length)) {
      const f = Math.min(1, (d - walked) / leg);
      return {
        at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
        forward: [(a[0] - b[0]) / leg, (a[1] - b[1]) / leg],
      };
    }
    walked += leg;
  }
  return { at: road[0] ?? [0, 0], forward: [0, 0] };
}

/** Its way: from where the pawn left it, up its lane of the road to a step of the point, then on
 *  a curve that leaves the road ahead to its place. */
function wayOf(piece: FilePlace, road: ReadonlyArray<Flat>, span: number): Way {
  const join = Math.min(piece.back, STEP * span);
  const lane = (d: number): { at: Flat; forward: Flat } => {
    const { at, forward } = roadAt(road, d);
    // To the right of the way forward, as the pawn walks its lanes (`march`).
    return { at: [at[0] - forward[1] * piece.side, at[1] + forward[0] * piece.side], forward };
  };
  const points: Flat[] = [piece.from];
  // Its lane turns where the road does: its bends, between where it stood and where it leaves.
  let walked = 0;
  const bends: number[] = [];
  for (let k = 1; k < road.length; k++) {
    walked += Math.hypot(road[k]![0] - road[k - 1]![0], road[k]![1] - road[k - 1]![1]);
    if (walked > join && walked < piece.back) bends.push(walked);
  }
  for (const d of [...bends.reverse(), join]) if (d < piece.back) points.push(lane(d).at);
  const start = points.at(-1)!;
  const { forward } =
    piece.back === 0
      ? { forward: [Math.sin(piece.heading), Math.cos(piece.heading)] as Flat }
      : lane(join);
  const d = Math.hypot(piece.to[0] - start[0], piece.to[1] - start[1]);
  const control: Flat = [start[0] + forward[0] * d * 0.5, start[1] + forward[1] * d * 0.5];
  for (let k = 1; k <= CURVE_POINTS; k++) {
    const u = k / CURVE_POINTS;
    points.push([
      (1 - u) ** 2 * start[0] + 2 * (1 - u) * u * control[0] + u * u * piece.to[0],
      (1 - u) ** 2 * start[1] + 2 * (1 - u) * u * control[1] + u * u * piece.to[1],
    ]);
  }
  const lengths = [0];
  for (let k = 1; k < points.length; k++)
    lengths.push(
      lengths[k - 1]! +
        Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![1] - points[k - 1]![1]),
    );
  return { points, lengths };
}

const msOf = (way: Way, span: number): number =>
  Math.min(
    DEPLOY_BOUNDS[1],
    Math.max(DEPLOY_BOUNDS[0], (way.lengths.at(-1)! / (SPANS_PER_S * span)) * 1000),
  );

/** **How long the file takes to deploy**, its last piece's start and way. */
export const deployMs = ({ span, road, pieces }: DeployingFile): number =>
  Math.max(0, ...pieces.map((piece, k) => k * STAGGER_MS + msOf(wayOf(piece, road, span), span)));

/** The point `s` along the way, and the way it goes there. */
function along({ points, lengths }: Way, s: number): { at: Flat; tangent: number | null } {
  let k = 1;
  while (k < points.length - 1 && lengths[k]! < s) k++;
  const [a, b] = [points[k - 1]!, points[k]!];
  const leg = lengths[k]! - lengths[k - 1]!;
  const f = leg > 0 ? Math.min(1, Math.max(0, (s - lengths[k - 1]!) / leg)) : 1;
  return {
    at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
    tangent: leg > 0 ? Math.atan2(b[0] - a[0], b[1] - a[1]) : null,
  };
}

/**
 * **The column deploys at its arrival** (#362, storyboard de la marche) : each piece leaves the
 * file `STAGGER_MS` after the one before, takes the road again up to a step of the point and
 * leaves it on a curve for its own place in the pile, a man at his march, a vehicle at its drive,
 * and turns to `front` over its last quarter. Before it leaves it stands where the pawn left it;
 * after, on its place, facing `front`.
 */
export function deployAt(
  file: DeployingFile,
  front: number,
  t: number,
): ReadonlyArray<{ readonly at: Flat; readonly heading: number; readonly walking: boolean }> {
  return file.pieces.map((piece, k) => {
    const start = k * STAGGER_MS;
    const way = wayOf(piece, file.road, file.span);
    const ms = msOf(way, file.span);
    if (t <= start) return { at: piece.from, heading: piece.heading, walking: false };
    if (t >= start + ms) return { at: piece.to, heading: front, walking: false };
    const share = span(t, start, start + ms);
    const u = (piece.infantry ? ease.march : ease.drive)(share);
    const { at, tangent } = along(way, u * way.lengths.at(-1)!);
    const goes = tangent ?? piece.heading;
    const heading = goes + wrap(front - goes) * ease.inOut(span(share, TURN_FROM, 1));
    return { at, heading, walking: true };
  });
}
