import type { Nation, UnitRole } from '@/domain/ids';
import cnAirTransport from './china/airTransport.glb';
import cnArmor1 from './china/armor-1.glb';
import cnArmor2 from './china/armor-2.glb';
import cnBomber from './china/bomber.glb';
import cnCargo from './china/cargo.glb';
import cnEscort from './china/escort.glb';
import cnFighter from './china/fighter.glb';
import cnInfantry1 from './china/infantry-1.glb';
import cnInfantry2 from './china/infantry-2.glb';
import cnLandTransport from './china/landTransport.glb';
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
import itAirTransport from './italy/airTransport.glb';
import itArmor1 from './italy/armor-1.glb';
import itArmor2 from './italy/armor-2.glb';
import itBomber from './italy/bomber.glb';
import itCargo from './italy/cargo.glb';
import itEscort from './italy/escort.glb';
import itFighter from './italy/fighter.glb';
import itInfantry1 from './italy/infantry-1.glb';
import itInfantry2 from './italy/infantry-2.glb';
import itLandTransport from './italy/landTransport.glb';
import jpArmor1 from './japan/armor-1.glb';
import jpArmor2 from './japan/armor-2.glb';
import jpBomber from './japan/bomber.glb';
import jpCargo from './japan/cargo.glb';
import jpCarrier from './japan/carrier.glb';
import jpEscort from './japan/escort.glb';
import jpFighter from './japan/fighter.glb';
import jpInfantry1 from './japan/infantry-1.glb';
import jpInfantry2 from './japan/infantry-2.glb';
import jpLandTransport from './japan/landTransport.glb';
import ukAirTransport from './uk/airTransport.glb';
import ukArmor1 from './uk/armor-1.glb';
import ukArmor2 from './uk/armor-2.glb';
import ukBomber from './uk/bomber.glb';
import ukCargo from './uk/cargo.glb';
import ukCarrier from './uk/carrier.glb';
import ukEscort from './uk/escort.glb';
import ukFighter from './uk/fighter.glb';
import ukInfantry1 from './uk/infantry-1.glb';
import ukInfantry2 from './uk/infantry-2.glb';
import ukLandTransport from './uk/landTransport.glb';
import usAirTransport from './usa/airTransport.glb';
import usArmor1 from './usa/armor-1.glb';
import usArmor2 from './usa/armor-2.glb';
import usBomber from './usa/bomber.glb';
import usCargo from './usa/cargo.glb';
import usCarrier from './usa/carrier.glb';
import usEscort from './usa/escort.glb';
import usFighter from './usa/fighter.glb';
import usInfantry1 from './usa/infantry-1.glb';
import usInfantry2 from './usa/infantry-2.glb';
import usLandTransport from './usa/landTransport.glb';
import suAirTransport from './ussr/airTransport.glb';
import suArmor1 from './ussr/armor-1.glb';
import suArmor2 from './ussr/armor-2.glb';
import suBomber from './ussr/bomber.glb';
import suCargo from './ussr/cargo.glb';
import suEscort from './ussr/escort.glb';
import suFighter from './ussr/fighter.glb';
import suInfantry1 from './ussr/infantry-1.glb';
import suInfantry2 from './ussr/infantry-2.glb';
import suLandTransport from './ussr/landTransport.glb';

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

// Still to sculpt: the R35 (French armor MK1), the Ju 52 (German air transport), the Japanese
// air transport, the Soviet, Chinese and Italian carriers and the French cargo — none exist as
// plates either. The artillery
// (lot 6b) has no file in any nation yet: `uk/artillery.glb` first, the common model of
// `PROMPTS-3D-2026-10-14.md` n° 2, then the seven others.
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
  uk: {
    infantry: [ukInfantry1, ukInfantry2],
    armor: [ukArmor1, ukArmor2],
    landTransport: ukLandTransport,
    fighter: ukFighter,
    bomber: ukBomber,
    airTransport: ukAirTransport,
    escort: ukEscort,
    cargo: ukCargo,
    carrier: ukCarrier,
  },
  usa: {
    infantry: [usInfantry1, usInfantry2],
    armor: [usArmor1, usArmor2],
    landTransport: usLandTransport,
    fighter: usFighter,
    bomber: usBomber,
    airTransport: usAirTransport,
    escort: usEscort,
    cargo: usCargo,
    carrier: usCarrier,
  },
  ussr: {
    infantry: [suInfantry1, suInfantry2],
    armor: [suArmor1, suArmor2],
    landTransport: suLandTransport,
    fighter: suFighter,
    bomber: suBomber,
    airTransport: suAirTransport,
    escort: suEscort,
    cargo: suCargo,
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
  china: {
    infantry: [cnInfantry1, cnInfantry2],
    armor: [cnArmor1, cnArmor2],
    landTransport: cnLandTransport,
    fighter: cnFighter,
    bomber: cnBomber,
    airTransport: cnAirTransport,
    escort: cnEscort,
    cargo: cnCargo,
  },
  italy: {
    infantry: [itInfantry1, itInfantry2],
    armor: [itArmor1, itArmor2],
    landTransport: itLandTransport,
    fighter: itFighter,
    bomber: itBomber,
    airTransport: itAirTransport,
    escort: itEscort,
    cargo: itCargo,
  },
  japan: {
    infantry: [jpInfantry1, jpInfantry2],
    armor: [jpArmor1, jpArmor2],
    landTransport: jpLandTransport,
    fighter: jpFighter,
    bomber: jpBomber,
    escort: jpEscort,
    cargo: jpCargo,
    carrier: jpCarrier,
  },
};
