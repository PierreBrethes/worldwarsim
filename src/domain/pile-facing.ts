import { bearingDegrees, type LonLat } from './geo';

const same = (a: LonLat, b: LonLat): boolean => a[0] === b[0] && a[1] === b[1];

/** Planar distance from `p` to the segment `a`→`b`, in degrees: only an order is read off it. */
function gapToSegment(p: LonLat, a: LonLat, b: LonLat): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const k =
    length === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
}

/**
 * **Where a column came from** to stand at `at` — the end of its route, or a stop on the way: the
 * last point of its route before `at` that is not `at`. `undefined` for a route that gives no way.
 */
export function cameFrom(route: ReadonlyArray<LonLat>, at?: LonLat): LonLat | undefined {
  const end = route.at(-1);
  if (end === undefined) return undefined;
  const stop = at ?? end;
  let last = route.length - 1;
  if (!same(stop, end)) {
    let best = Infinity;
    for (let k = 0; k + 1 < route.length; k++) {
      const gap = gapToSegment(stop, route[k]!, route[k + 1]!);
      if (gap < best) [best, last] = [gap, k];
    }
  }
  return route
    .slice(0, last + 1)
    .reverse()
    .find((point) => !same(point, stop));
}

/**
 * **Le cap d'une pile posée** (#362) : une colonne qui arrive sur un point regarde où elle allait,
 * le cap de sa route à son arrêt — la fin, ou `at` en chemin (degrés depuis le nord) ; une pile
 * déjà là garde le sien, et la colonne qui la rejoint le prend. `undefined` quand la route ne dit
 * pas d'où elle vient, ou que la pile rejointe n'en a pas.
 */
export function arrivalFacing(
  route: ReadonlyArray<LonLat>,
  standing: ReadonlyArray<{ readonly facing?: number | undefined }>,
  at?: LonLat,
): number | undefined {
  if (standing.length > 0) return standing.find(({ facing }) => facing !== undefined)?.facing;
  const stop = at ?? route.at(-1);
  const from = cameFrom(route, at);
  return stop === undefined || from === undefined ? undefined : bearingDegrees(from, stop);
}
