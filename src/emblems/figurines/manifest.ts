import type { Nation, UnitRole } from '@/domain/ids';
import frAirTransport from './france/airTransport.glb';
import frArmor2 from './france/armor-2.glb';
import frBomber from './france/bomber.glb';
import frCarrier from './france/carrier.glb';
import frEscort from './france/escort.glb';
import frFighter from './france/fighter.glb';
import frInfantry1 from './france/infantry-1.glb';
import frInfantry2 from './france/infantry-2.glb';
import frLandTransport from './france/landTransport.glb';
import deArmor1 from './germany/armor-1.glb';
import deArmor2 from './germany/armor-2.glb';
import deBomber from './germany/bomber.glb';
import deCargo from './germany/cargo.glb';
import deCarrier from './germany/carrier.glb';
import deEscort from './germany/escort.glb';
import deFighter from './germany/fighter.glb';
import deInfantry1 from './germany/infantry-1.glb';
import deInfantry2 from './germany/infantry-2.glb';
import deLandTransport from './germany/landTransport.glb';

/**
 * **The sculpted figurines, by nation and role**, one GLB per plate and named like it
 * (`armor-1.glb` beside `armor-1.webp`). A tiered role lists its two marks; a mark without a
 * file is `null`, and the piece keeps its plate or domain silhouette.
 *
 * Each file follows the brief given to Claude Design (ADR 0026 §2): y up, front towards +z,
 * origin on the ground, the plate's length, named parts and `fx_*` markers.
 * `figurines/glb.test.ts` reads every file listed here.
 */
export type FigurineFiles = Partial<
  Record<UnitRole, string | readonly [string | null, string | null]>
>;

// Still to sculpt: the R35 (French armor MK1), and the Ju 52 (German air transport).
export const FIGURINE_FILES: Readonly<Partial<Record<Nation, FigurineFiles>>> = {
  france: {
    infantry: [frInfantry1, frInfantry2],
    armor: [null, frArmor2],
    landTransport: frLandTransport,
    fighter: frFighter,
    bomber: frBomber,
    airTransport: frAirTransport,
    escort: frEscort,
    carrier: frCarrier,
  },
  germany: {
    infantry: [deInfantry1, deInfantry2],
    armor: [deArmor1, deArmor2],
    landTransport: deLandTransport,
    fighter: deFighter,
    bomber: deBomber,
    escort: deEscort,
    cargo: deCargo,
    carrier: deCarrier,
  },
};
