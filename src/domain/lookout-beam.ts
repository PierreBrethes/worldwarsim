import type { LonLat } from './geo';
import { nightOfAltitude, subsolarPoint, sunAltitude } from './daylight';

/**
 * **Le faisceau d'une vigie** (#644) : 0 éteint, 1 plein. Un point dont `lookoutKm` n'est pas
 * `null` allume le sien, la nuit de son lieu seulement ; le métier ne change rien. La pente est
 * celle des lumières de ville (`night.ts`) : rien au premier assombrissement, plein une fois le
 * crépuscule passé.
 */
export function lookoutBeamStrength(lookoutKm: number | null, at: LonLat, instant: number): number {
  if (lookoutKm === null) return 0;
  const dark = nightOfAltitude(sunAltitude(subsolarPoint(instant), at));
  return Math.min(1, Math.max(0, (dark - 0.3) / 0.5));
}
