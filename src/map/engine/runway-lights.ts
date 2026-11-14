import { Vector3 } from 'three';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { RUNWAY_MODULES, runwayModules } from './runway-fit';

/** **How long the first light takes to reach the runway's end**, ms. `@a-mesurer` */
export const LIGHT_WAVE_MS = 1400;
/** How long one reach takes to come on, and the whole runway to go out, ms. `@a-mesurer` */
export const LIGHT_FADE_MS = 400;

const clamp01 = (k: number): number => Math.min(1, Math.max(0, k));

/**
 * **How lit the runway's lights are `reach` metres out from the hangars' end, `t` ms into a
 * movement of `ms`** (#497, storyboard « La nuit »): they come on from the hangars out, then all
 * go out together in the movement's last `LIGHT_FADE_MS`. 0 out, 1 lit. A runway cut short
 * (#493) is `length` metres long, and its wave takes as long to reach its end.
 */
export function runwayLit(
  reach: number,
  t: number,
  ms: number,
  length: number = AIRFIELD.runway.length,
): number {
  const start = (reach / length) * LIGHT_WAVE_MS;
  const on = clamp01((t - start) / LIGHT_FADE_MS);
  const off = clamp01((ms - t) / LIGHT_FADE_MS);
  return Math.min(on, off);
}

/** **Where a runway light stands in its module's file**, metres: across the runway, along it, and the
 *  height of its head (read from `piste.glb`, tied to it by `runway-lights.test.ts`). */
const LAMP_AT = { across: 14.5, along: 0.4, height: 0.6 };
/** **Halos an airfield may lay while a plane moves on it**; past it, one to a module. `@a-mesurer` */
export const RUNWAY_HALO_CAP = 64;
/** **How far a light's halo reaches**, model metres: a little over a module's width of the runway
 *  between two lights, so a row reads as a line from afar. `@a-mesurer` */
export const RUNWAY_HALO_RADIUS = 3;

/** A halo to lay, `reach` metres out from the hangars, at `at` in the site's model (metres). */
export type RunwayHalo = { readonly reach: number; readonly at: Vector3 };

/**
 * **The halos of a runway's lights**, in the site's frame (`AIRFIELD.runway`), for `toBoard` to
 * carry to the board: one to a light — two to a module but the ends'; past `cap`, one to a module,
 * at its axis. The `reach` is the one `runwayLit` is asked. A runway of `count` modules (#493) has
 * the lights of those.
 */
export function runwayHalos(cap = RUNWAY_HALO_CAP, count = RUNWAY_MODULES): RunwayHalo[] {
  const { x1, z } = AIRFIELD.runway;
  const { across, along: shift, height } = LAMP_AT;
  const lamps: RunwayHalo[] = [];
  const axes: RunwayHalo[] = [];
  let out = 0;
  for (const [name, metres, way] of runwayModules(count)) {
    const reach = out + metres / 2;
    out += metres;
    if (name === 'piste_bout') continue;
    const x = x1 - reach;
    axes.push({ reach, at: new Vector3(x, height, z) });
    // The module is turned a quarter either way: its file's x runs across the runway.
    for (const side of [-1, 1])
      lamps.push({ reach, at: new Vector3(x + way * shift, height, z + side * across) });
  }
  return lamps.length > cap ? axes : lamps;
}
