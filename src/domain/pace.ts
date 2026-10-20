import {
  MINUTES_PER_1000_KM_ON_LAND,
  MINUTES_PER_ROUTE_UNIT,
  routeMinutes,
} from '../../convex/constants';
import { theatreMinutesPer1000Km } from './blitz';
import { DOMAIN_BY_ROLE } from './troops';
import type { UnitRole } from './ids';
import { landCostOf } from './movement-orders';
import { COST_BY_MEDIUM, KM_PER_UNIT } from './routing';
import type { Theatre } from './theatres';

/**
 * **La seule route vers une durée** : la Mondiale arrondit à la minute (`routeMinutes`), la Blitz
 * court à l'échelle de son théâtre, en secondes entières. Le serveur date un mouvement par
 * cette fonction (`pacedMinutes`), l'écran en tire l'allure d'une pièce : une seule lecture, donc
 * le temps de la fiche est celui que le mouvement aura.
 */
export function costMinutes(costUnits: number, theatre: Theatre | null): number {
  if (theatre === null) return routeMinutes(costUnits);
  const minutes =
    (costUnits * MINUTES_PER_ROUTE_UNIT * theatreMinutesPer1000Km(theatre)) /
    MINUTES_PER_1000_KM_ON_LAND;
  return Math.max(1, Math.round(minutes * 60)) / 60;
}

/** L'air n'a pas de multiplicateur : sa distance est son coût (`airRoute`). */
const AIR_COST = 1;

const COST_OF_DOMAIN = {
  sea: COST_BY_MEDIUM.sea,
  air: AIR_COST,
} as const;

/** **Ce que coûte une unité de route à cette pile** : celle de son milieu le plus lent, la
 *  terre lue par la composition (`landCostOf` : un camion pour deux fantassins roule la pile). */
export function paceCostOf(roles: ReadonlyArray<UnitRole>): number {
  const costs = roles.map((role) =>
    DOMAIN_BY_ROLE[role] === 'land' ? landCostOf(roles) : COST_OF_DOMAIN[DOMAIN_BY_ROLE[role]],
  );
  return Math.max(...costs);
}

/** L'allure : le temps que met cette pile à couvrir 1 000 km, en minutes de son mode. */
export const minutesPer1000KmOf = (roles: ReadonlyArray<UnitRole>, theatre: Theatre | null) =>
  costMinutes((1000 / KM_PER_UNIT) * paceCostOf(roles), theatre);
