import type { BuildingKey } from './ids';
import { buildMinutes } from '../../convex/constants';
import type { BuildCostKey } from './ids';
import { PROJECTION_BY_DOMAIN } from './troops';

/**
 * **Un niveau accélère ce que fait le bâtiment** (ADR 0031) : chaque niveau au-delà du premier
 * retire une part de la durée, les parts se multiplient, un plancher les borne.
 * @a-mesurer l'équilibrage chiffrera la part par niveau
 */
export const LEVEL_SPEEDUP = 0.15;

/** @a-mesurer la durée ne descend jamais sous cette part de la base */
export const LEVEL_SPEED_FLOOR = 0.4;

/** Le facteur de durée d'un bâtiment de ce niveau : 1 au premier, jamais sous le plancher. */
export const levelSpeed = (level: number): number =>
  Math.max(LEVEL_SPEED_FLOOR, (1 - LEVEL_SPEEDUP) ** (Math.max(1, level) - 1));

/** La durée qu'un bâtiment de ce niveau met à ce qui en prend `minutes` à la base : la seule
 *  que l'écran affiche et que le serveur date. */
export const spedMinutes = (minutes: number, level: number): number =>
  Math.round(minutes * levelSpeed(level));

/** **La durée d'un chantier** au niveau du QG : la seule que le serveur date (`runHead`) et que
 *  l'écran annonce avant le départ. */
export const worksMinutes = (key: BuildCostKey, level: number, hqLevel: number): number =>
  spedMinutes(buildMinutes(key, level), hqLevel);

/** **La durée d'un chantier de fondation** : celle d'un avant-poste de niveau 1, accélérée comme
 *  toute élévation par le QG. */
export const foundationMinutes = (hqLevel: number): number => worksMinutes('outpost', 1, hqLevel);

/** Le gain qu'imprime la fiche, en pour cent entiers : « niveau 3 : −28 % ». */
export const levelGain = (level: number): number => Math.round((1 - levelSpeed(level)) * 100);

/** Le QG accélère les chantiers, les sites de projection la formation, le Centre de recherche
 *  la recherche. Une exploitation produit un débit, pas une durée : elle n'y est pas. */
export const speedsUp = (key: BuildingKey): boolean =>
  key === 'hq' || key === 'researchCenter' || Object.values(PROJECTION_BY_DOMAIN).includes(key);
