import type { Nation, UnitRole } from '@/domain/ids';
import airTransport from './france/airTransport.glb';
import armor2 from './france/armor-2.glb';
import bomber from './france/bomber.glb';
import carrier from './france/carrier.glb';
import escort from './france/escort.glb';
import fighter from './france/fighter.glb';
import infantry1 from './france/infantry-1.glb';
import landTransport from './france/landTransport.glb';

/**
 * **The sculpted figurines, by nation and role**, one GLB per plate and named like it
 * (`armor-1.glb` beside `armor-1.webp`). A tiered role lists its two marks; a mark without a
 * file is `null` and falls back to what the engine can code, or to the domain silhouette.
 *
 * Each file follows the brief given to Claude Design (ADR 0026 §2): y up, front towards +z,
 * origin on the ground, the plate's length, named parts and `fx_*` markers.
 * `figurines/glb.test.ts` reads every file listed here.
 */
export type FigurineFiles = Partial<
  Record<UnitRole, string | readonly [string | null, string | null]>
>;

// The R35 (armor MK1) and the kneeling bazooka man (infantry MK2) are still to be sculpted.
export const FIGURINE_FILES: Readonly<Partial<Record<Nation, FigurineFiles>>> = {
  france: {
    infantry: [infantry1, null],
    armor: [null, armor2],
    landTransport,
    fighter,
    bomber,
    airTransport,
    escort,
    carrier,
  },
};
