import { costMinutes } from './pace';
import { COST_BY_MEDIUM, KM_PER_UNIT } from './routing';

/** The round lengths a scale may take, per decade. */
const ROUND = [1, 2, 5] as const;

/**
 * **La barre d'échelle** : la plus longue longueur ronde (1, 2 ou 5 × 10ⁿ km) qui tient dans
 * `room` pixels à `kmPerPx` kilomètres le pixel. `null` quand la caméra ne dit rien d'utile.
 */
export function scaleBarOf(kmPerPx: number, room: number): { km: number; px: number } | null {
  if (!(kmPerPx > 0) || !Number.isFinite(kmPerPx) || !(room > 0)) return null;
  const limit = room * kmPerPx;
  const decade = Math.floor(Math.log10(limit));
  const km = [decade, decade - 1]
    .flatMap((power) => ROUND.map((mantissa) => mantissa * 10 ** power))
    .filter((length) => length <= limit)
    .reduce((best, length) => Math.max(best, length), 0);
  return km > 0 ? { km, px: km / kmPerPx } : null;
}

/**
 * **Le temps de marche d'une troupe à pied** sur `km` kilomètres de terre : le prix d'une unité de
 * route à pied (`COST_BY_MEDIUM.land`) passé par `costMinutes`, la même fonction que le serveur
 * date un mouvement — aucun chiffre en dur ici.
 */
export const onFootMinutes = (km: number): number =>
  costMinutes((km / KM_PER_UNIT) * COST_BY_MEDIUM.land, null);
