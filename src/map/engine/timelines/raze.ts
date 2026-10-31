import { ease, span } from './curves';

/** **Raser, l'affaissement** (`storyboard-combat/commun/combat.js`, `RAZE.affaisse`), en ms :
 *  il tremble, s'écrase sur lui-même, tient, le tas s'efface, puis son empreinte. */
const RAZE = {
  tremble: [0, 300],
  fall: [300, 1200],
  hold: [1200, 1800],
  erase: [1800, 2600],
  ink: [2600, 3200],
} as const;
export const RAZE_MS = RAZE.ink[1];
/** Its two puffs of dust go up as it falls, half a second apart. */
export const RAZE_DUST_AT = [RAZE.fall[0], RAZE.fall[0] + 500] as const;

export type RazePose = {
  /** Its rock about its long axis, in radians. */
  readonly sway: number;
  /** Its height against its own. */
  readonly height: number;
  /** How far it has blackened, 0 to 1 (`charred`). */
  readonly char: number;
  readonly opacity: number;
  /** Its footprint of ink, 0 to 1. */
  readonly ink: number;
};

/** **The building as it falls**, `t` ms after the view lost it. */
export function razeAt(t: number): RazePose {
  const tremble = span(t, ...RAZE.tremble);
  const fall = ease.in2(span(t, ...RAZE.fall));
  return {
    sway: Math.sin(tremble * Math.PI * 6) * 0.026 * (1 - tremble),
    height: 1 - 0.88 * fall,
    char: 0.7 * fall + 0.15 * span(t, ...RAZE.hold),
    opacity: 1 - ease.inOut(span(t, ...RAZE.erase)),
    ink: span(t, RAZE.erase[0], RAZE.erase[0] + 300) * (1 - span(t, ...RAZE.ink)),
  };
}

export const RAZE_RING_MS = 600;

/** **Reduced motion: a ring of ink where it stood**, opening and fading over 0.6 s. */
export function razeRingAt(t: number): { readonly size: number; readonly opacity: number } {
  const k = span(t, 0, RAZE_RING_MS);
  return { size: 0.6 + 0.4 * ease.out3(k), opacity: 0.6 * (1 - k) };
}
