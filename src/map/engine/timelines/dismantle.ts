import { ease, span } from './curves';

/** **Démanteler, l'épingle** (`storyboard-combat/commun/combat.js`, `DISM`) : le losange bascule
 *  sur sa pointe basse en 0,5 s, puis s'efface. */
export const PIN_TILT_MS = 500;
export const PIN_FALL_MS = 800;
/** The storyboard's 87°, in radians. */
const PIN_TIPPED = 1.52;

export type PinFall = { readonly tilt: number; readonly opacity: number };

/** **The pin as it leaves**, `t` ms after the view lost it. */
export function pinFallAt(t: number): PinFall {
  return {
    tilt: ease.in2(span(t, 0, PIN_TILT_MS)) * PIN_TIPPED,
    opacity: 1 - ease.inOut(span(t, PIN_TILT_MS, PIN_FALL_MS)),
  };
}

/** **L'aire qui s'efface en tournant** : the storyboard's 0,6 s → 1,8 s (`DISM.reach`), from the
 *  north, once the pin has tipped. */
const SWEEP = [600, 1800] as const;
export const DISMANTLE_SWEEP_MS = SWEEP[1];

/** How much of the area is erased, 0 to 1, going clockwise from the north. */
export const dismantleSweepAt = (t: number): number => ease.inOut(span(t, ...SWEEP));
