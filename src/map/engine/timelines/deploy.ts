import { ease, span } from './curves';

type Flat = readonly [x: number, z: number];

/** **A piece of the file at the arrival** (#362): where the pawn left it and the way it faced,
 *  and its own place in the pile at rest, on the board. */
export type FilePlace = {
  readonly from: Flat;
  readonly heading: number;
  readonly to: Flat;
  readonly infantry: boolean;
};

/** The file, and the span its pieces are drawn at on the board: the pace is in spans. */
export type DeployingFile = { readonly span: number; readonly pieces: ReadonlyArray<FilePlace> };

/** **Between two pieces leaving the file** (storyboard de la marche, `STAGGER`). */
const STAGGER_MS = 160;
/** A piece's way lasts between these, like `PACE_BOUNDS` (`DEPLOY_BOUNDS`). */
const DEPLOY_BOUNDS = [1200, 2600] as const;
/** The pace of the deployment, in spans a second. `@a-mesurer` */
const SPANS_PER_S = 1.5;
/** The last quarter: the piece turns to the front (`TURN_FROM`). */
const TURN_FROM = 0.75;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (k: number): number => k * k * (3 - 2 * k);

/** Its way: on from where it faced, then round to its place (a quadratic curve). */
function wayOf({ from, heading, to }: FilePlace): { control: Flat; length: number } {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const control: Flat = [
    from[0] + Math.sin(heading) * d * 0.5,
    from[1] + Math.cos(heading) * d * 0.5,
  ];
  // The chord and the two arms bound the curve: their mean is near enough to time it.
  const arms = Math.hypot(control[0] - from[0], control[1] - from[1]) * 2;
  return { control, length: (d + arms) / 2 };
}

const msOf = (piece: FilePlace, span: number): number =>
  Math.min(
    DEPLOY_BOUNDS[1],
    Math.max(DEPLOY_BOUNDS[0], (wayOf(piece).length / (SPANS_PER_S * span)) * 1000),
  );

/** **How long the file takes to deploy**, its last piece's start and way. */
export const deployMs = ({ span, pieces }: DeployingFile): number =>
  Math.max(0, ...pieces.map((piece, k) => k * STAGGER_MS + msOf(piece, span)));

/**
 * **The column deploys at its arrival** (#362, storyboard de la marche) : each piece leaves the
 * file `STAGGER_MS` after the one before, goes on the way it faced and round to its own place in
 * the pile, a man at his march, a vehicle at its drive, and turns to `front` over its last quarter.
 * Before it leaves it stands where the pawn left it; after, on its place, facing `front`.
 */
export function deployAt(
  file: DeployingFile,
  front: number,
  t: number,
): ReadonlyArray<{ readonly at: Flat; readonly heading: number; readonly walking: boolean }> {
  return file.pieces.map((piece, k) => {
    const start = k * STAGGER_MS;
    const ms = msOf(piece, file.span);
    if (t <= start) return { at: piece.from, heading: piece.heading, walking: false };
    if (t >= start + ms) return { at: piece.to, heading: front, walking: false };
    const share = span(t, start, start + ms);
    const u = (piece.infantry ? ease.march : ease.drive)(share);
    const { control } = wayOf(piece);
    const { from, to } = piece;
    const at: Flat = [
      (1 - u) ** 2 * from[0] + 2 * (1 - u) * u * control[0] + u * u * to[0],
      (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * control[1] + u * u * to[1],
    ];
    const dx = (1 - u) * (control[0] - from[0]) + u * (to[0] - control[0]);
    const dz = (1 - u) * (control[1] - from[1]) + u * (to[1] - control[1]);
    const tangent = dx === 0 && dz === 0 ? piece.heading : Math.atan2(dx, dz);
    const heading = tangent + wrap(front - tangent) * smooth(span(share, TURN_FROM, 1));
    return { at, heading, walking: true };
  });
}
