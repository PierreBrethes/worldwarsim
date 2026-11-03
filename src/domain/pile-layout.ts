import type { LonLat } from './geo';

/**
 * **Où se tiennent les pièces d'une pile, et où chacune part en couronne** (ADR 0026 §5, #277) :
 * le moteur range la pile par `block`, le serveur la disperse par `crownSeats`, sur le même rang.
 * Tout est dans les unités de la pile, x le long du rang, z vers son front.
 */

/** Between two groups, in the pile's units: a squad and a tank are both about a third of one wide. */
export const GROUP_SPACING = 0.5;
/** Between two ranks of a formation, in the pile's units: a man's height seen at the board's tilt. */
const RANK_DEPTH = 0.85;
/** Between two pieces of a squad: three men abreast fill a group's width, a gap stays between. */
const SQUAD_SPACING = 0.62;

export type Slot = { readonly x: number; readonly z: number };

/** **Where each piece stands in a row around the pile's point**, side by side and centred. */
export function pileLayout(pieces: number): ReadonlyArray<number> {
  return Array.from({ length: pieces }, (_, k) => (k - (pieces - 1) / 2) * GROUP_SPACING);
}

/** A block of `count` slots around its centre: one row up to four — a man's figure would hide
 *  the one behind him at the board's tilt —, then ranks far enough apart to read. */
export function block(count: number): Slot[] {
  if (count <= 4)
    return pileLayout(count).map((x) => ({ x: (x * SQUAD_SPACING) / GROUP_SPACING, z: 0 }));
  const columns = Math.ceil(Math.sqrt(count));
  const ranks = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, k) => {
    const rank = Math.floor(k / columns);
    const inRank = Math.min(columns, count - rank * columns);
    return {
      x: ((k % columns) - (inRank - 1) / 2) * SQUAD_SPACING,
      z: ((ranks - 1) / 2 - rank) * RANK_DEPTH,
    };
  });
}

/**
 * **Quelle place de la couronne prend chaque pièce** (#277, relecture du 03/11) : les pièces dans
 * l'ordre de la pile (`pilePieces`), sur un rang simple tourné par son cap (`facing`, degrés depuis
 * le nord ; absent, le sud), les places de la couronne triées par angle, puis la rotation
 * circulaire qui les rapproche le plus — aucun chemin ne croise, en O(n²). La tête reste au point
 * (`spots[0]`). Rend, pour chaque pièce, l'index de sa place dans `spots`.
 */
export function crownSeats(
  facing: number | undefined,
  spots: ReadonlyArray<LonLat>,
): ReadonlyArray<number> {
  const [center, ...ring] = spots;
  if (center === undefined || ring.length === 0) return center === undefined ? [] : [0];
  const shrink = Math.cos((center[1] * Math.PI) / 180);
  // East and north from the point; the scale is no matter, only the angles and their order.
  const offsets = ring.map(([lon, lat]) => {
    let east = lon - center[0];
    if (east > 180) east -= 360;
    if (east < -180) east += 360;
    return [east * shrink, lat - center[1]] as const;
  });
  const byAngle = offsets
    .map((offset, k) => ({ k: k + 1, offset, angle: Math.atan2(offset[1], offset[0]) }))
    .sort((a, b) => a.angle - b.angle);
  // The rank's own x on the board, east and north: a pile facing θ stands its rank across it.
  const theta = ((facing ?? 180) * Math.PI) / 180;
  const along = [-Math.cos(theta), Math.sin(theta)] as const;
  const rank = pileLayout(spots.length)
    .slice(1)
    .map((x) => [x * along[0], x * along[1]] as const);
  let best = { turn: 0, score: -Infinity };
  for (let turn = 0; turn < byAngle.length; turn++) {
    const score = rank.reduce((sum, [x, y], k) => {
      const [sx, sy] = byAngle[(k + turn) % byAngle.length]!.offset;
      return sum + x * sx + y * sy;
    }, 0);
    if (score > best.score) best = { turn, score };
  }
  return [0, ...rank.map((_, k) => byAngle[(k + best.turn) % byAngle.length]!.k)];
}
