import type { LonLat } from './geo';

/**
 * **Les points stratégiques de la saison test** (P11, ADR 0027 §4) : le premier vivier, moins
 * Bakou, Dakar et Singapour qui attendent l'économie de la Mondiale. Ils sont sept, donc **les
 * sept sont tirés à chaque saison**, sans les contraintes de tirage du 14/10 (décision de Pierre,
 * 18/10) : le tirage par la graine reviendra avec un vivier plus large.
 *
 * Chacun est un lieu réel de 1940, public, qui ne produit rien et casse une règle pour qui le tient.
 */
export const STRATEGIC_POINTS = {
  tangier: [-5.81, 35.77],
  istanbul: [28.98, 41.01],
  rangoon: [96.16, 16.8],
  hongKong: [114.17, 22.32],
  halifax: [-63.57, 44.65],
  narvik: [17.43, 68.44],
  lisbon: [-9.14, 38.72],
} as const satisfies Record<string, LonLat>;

export type StrategicPointKey = keyof typeof STRATEGIC_POINTS;

export const STRATEGIC_POINT_KEYS = Object.keys(
  STRATEGIC_POINTS,
) as ReadonlyArray<StrategicPointKey>;
