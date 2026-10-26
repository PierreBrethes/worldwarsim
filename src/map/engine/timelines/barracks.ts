import type { Sequence } from '../sequences';
import { ease, span } from './curves';

const OPEN_MS = 550;
const CLOSE_MS = 450;
const BOUNCE_MS = 80;
/** Le temps que les battants restent ouverts, le temps qu'une recrue passe. `@a-mesurer` : jusqu'à
 *  #268, qui fait sortir la troupe. */
const HELD_MS = 1200;
/** Ouverts vers l'extérieur, à 110° (décision de Pierre, #268, 23/10). */
const OUT = (110 * Math.PI) / 180;
const BOUNCE = (4 * Math.PI) / 180;

/**
 * **Les battants de la caserne laissent passer une recrue** (`T.caserne` du storyboard) : ouverts
 * vers l'extérieur en 550 ms (`out3`), tenus, refermés en 450 ms (`in2`), puis un rebond de 4° en
 * 80 ms. Le battant de gauche a son gond à droite du plan (+x) : les deux tournent en sens
 * contraires.
 */
export function barracksDoors(): Sequence<'barracks'> {
  const closeAt = OPEN_MS + HELD_MS;
  const ms = closeAt + CLOSE_MS + BOUNCE_MS;
  return {
    family: 'barracks',
    ms,
    at(t) {
      if (t <= 0 || t >= ms) return {};
      const angle =
        OUT *
          ease.out3(span(t, 0, OPEN_MS)) *
          (1 - ease.in2(span(t, closeAt, closeAt + CLOSE_MS))) +
        Math.sin(span(t, closeAt + CLOSE_MS, ms) * Math.PI) * BOUNCE;
      return {
        porte_gauche: { turn: [0, angle, 0] },
        porte_droite: { turn: [0, -angle, 0] },
      };
    },
  };
}
