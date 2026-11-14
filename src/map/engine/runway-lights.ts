import { AIRFIELD } from '@/emblems/kits/manifest';

/** **How long the first light takes to reach the runway's end**, ms. `@a-mesurer` */
export const LIGHT_WAVE_MS = 1400;
/** How long one reach takes to come on, and the whole runway to go out, ms. `@a-mesurer` */
export const LIGHT_FADE_MS = 400;

const clamp01 = (k: number): number => Math.min(1, Math.max(0, k));

/**
 * **How lit the runway's lights are `reach` metres out from the hangars' end, `t` ms into a
 * movement of `ms`** (#497, storyboard « La nuit »): they come on from the hangars out, then all
 * go out together in the movement's last `LIGHT_FADE_MS`. 0 out, 1 lit.
 */
export function runwayLit(reach: number, t: number, ms: number): number {
  const start = (reach / AIRFIELD.runway.length) * LIGHT_WAVE_MS;
  const on = clamp01((t - start) / LIGHT_FADE_MS);
  const off = clamp01((ms - t) / LIGHT_FADE_MS);
  return Math.min(on, off);
}
