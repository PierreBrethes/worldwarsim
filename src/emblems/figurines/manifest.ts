import type { Nation, UnitRole } from '@/domain/ids';

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

export const FIGURINE_FILES: Readonly<Partial<Record<Nation, FigurineFiles>>> = {};
