import { wrap } from '../articulation';
import { type Flat, wayOf } from './boarding';
import { ease, span } from './curves';

/** The storyboard's crown (« une pile vivante », U): 1.5 spans a second, 1.2 to 2.6 s, starts
 *  0.16 s apart in the rank's order, the way's lead 0.4 the front's and its bend 0.35 of the way.
 *  `@a-mesurer` */
const CROWN = { spansPerS: 1.5, min: 1200, max: 2600, stagger: 160, front: 0.4, bend: 0.35 };

/**
 * **Une pièce mise à part gagne sa place en couronne** (#277, U) : de sa place au rang, d'abord
 * vers le front, en courbe jusqu'à sa place, et tourne sur le dernier quart pour regarder du point
 * vers elle — le cap que le serveur écrit. Rend quand elle part, combien elle marche, et où elle
 * est `t` ms après le signal.
 */
export function crownWayOf(piece: {
  /** The point the crown rings: each piece set apart faces away from it. */
  readonly center: Flat;
  readonly from: Flat;
  readonly front: Flat;
  readonly to: Flat;
  readonly span: number;
  readonly rank: number;
  readonly infantry: boolean;
}): {
  readonly start: number;
  readonly ms: number;
  at(t: number): { readonly at: Flat; readonly heading: number; readonly moving: boolean };
} {
  const { center, from, front, to } = piece;
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const along: Flat = d > 0 ? [(to[0] - from[0]) / d, (to[1] - from[1]) / d] : front;
  const lead: Flat = [
    front[0] * CROWN.front + along[0] * (1 - CROWN.front),
    front[1] * CROWN.front + along[1] * (1 - CROWN.front),
  ];
  const norm = Math.hypot(...lead) || 1;
  const way = wayOf(
    from,
    [from[0] + (lead[0] / norm) * d * CROWN.bend, from[1] + (lead[1] / norm) * d * CROWN.bend],
    to,
  );
  const ms = Math.round(
    Math.min(CROWN.max, Math.max(CROWN.min, (way.length / (CROWN.spansPerS * piece.span)) * 1000)),
  );
  const start = CROWN.stagger * piece.rank;
  const rest = Math.atan2(front[0], front[1]);
  const out = Math.atan2(to[0] - center[0], to[1] - center[1]);
  const curve = piece.infantry ? ease.march : ease.drive;
  return {
    start,
    ms,
    at(t) {
      const k = span(t, start, start + ms);
      if (k === 0) return { at: from, heading: rest, moving: false };
      const { at, heading } = way.at(curve(k) * way.length);
      const turned = heading + wrap(out - heading) * ease.inOut(span(k, 0.75, 1));
      return { at: k === 1 ? to : at, heading: k === 1 ? out : turned, moving: k < 1 };
    },
  };
}
