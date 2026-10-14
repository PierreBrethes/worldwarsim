import { INDIRECT_FIRE } from '../../convex/constants';
import { withinTheatre } from './blitz';
import { distanceKm, type LonLat } from './geo';
import type { UnitRole } from './ids';
import type { Theatre } from './theatres';
import { LIFT_CAPACITY } from './troops';

/**
 * **Le tir indirect** (B20, lot 6b) : l'artillerie frappe de loin une unité en vue, sans riposte
 * reçue ni donnée, et ne tire pas au contact. Une seule règle pour la rose et pour
 * `movements.bombard` ; les nombres vivent dans `INDIRECT_FIRE`.
 */
export const firesIndirect = (role: UnitRole): boolean => role === 'artillery';

/** L'instant où une pièce posée à `settledAt` est en batterie. */
export const emplacedAt = (settledAt: number): number =>
  settledAt + INDIRECT_FIRE.emplaceSeconds * 1000;

export type BombardRefusal =
  | 'BLITZ_ONLY'
  | 'ONE_UNIT_ONLY'
  | 'ARTILLERY_ONLY'
  | 'ON_THE_MOVE'
  | 'ABOARD'
  | 'NOTHING_TO_ATTACK'
  | 'OUTSIDE_THEATRE'
  | 'NOT_EMPLACED'
  | 'RELOADING'
  | 'TOO_CLOSE'
  | 'OUT_OF_RANGE';

export type Bombardment = {
  readonly roles: ReadonlyArray<UnitRole>;
  readonly from: LonLat;
  readonly to: LonLat;
  /** `null` hors Blitz : la Mondiale n'a pas encore d'artillerie. */
  readonly theatre: Theatre | null;
  /** La cible est dans les relevés du joueur à l'instant — on ne tire pas sur un souvenir. */
  readonly seen: boolean;
  /** L'instant où la pièce est en batterie (`emplacedAt`). */
  readonly emplacedAt: number;
  readonly reloadUntil: number | null;
  /** Dans un mouvement : elle est en route, et ne se met pas en batterie. */
  readonly moving: boolean;
  /** À bord d'un transport (`aboardAt`) : une pièce transportée n'agit pas. */
  readonly aboard: boolean;
  readonly now: number;
};

/**
 * **À bord** : sur un point, au large, ou avec une coque ou une aile à soi à la même adresse —
 * la règle des sièges (`boardingPile`) : à quai, dans un bâtiment, personne n'est à bord.
 */
export const aboardAt = ({
  onPoint,
  afloat,
  roles,
}: {
  readonly onPoint: boolean;
  readonly afloat: boolean;
  readonly roles: ReadonlyArray<UnitRole>;
}): boolean => onPoint && (afloat || roles.some((role) => (LIFT_CAPACITY[role] ?? 0) > 0));

export function bombardRefusalOf(order: Bombardment): BombardRefusal | null {
  const { roles, theatre, now } = order;
  if (theatre === null) return 'BLITZ_ONLY';
  if (roles.length > 1) return 'ONE_UNIT_ONLY';
  if (roles[0] === undefined || !firesIndirect(roles[0])) return 'ARTILLERY_ONLY';
  if (order.moving) return 'ON_THE_MOVE';
  if (order.aboard) return 'ABOARD';
  if (!order.seen) return 'NOTHING_TO_ATTACK';
  if (!withinTheatre(theatre, order.to)) return 'OUTSIDE_THEATRE';
  if (now < order.emplacedAt) return 'NOT_EMPLACED';
  if (order.reloadUntil !== null && now < order.reloadUntil) return 'RELOADING';
  const km = distanceKm(order.from, order.to);
  if (km < INDIRECT_FIRE.deadZoneKm) return 'TOO_CLOSE';
  return km > INDIRECT_FIRE.rangeKm ? 'OUT_OF_RANGE' : null;
}

/** Ce que la phrase du refus nomme — distance, bornes, attente —, la même des deux côtés. */
export const bombardRefusalDetails = (order: Bombardment) => ({
  km: Math.round(distanceKm(order.from, order.to)),
  minimum: INDIRECT_FIRE.deadZoneKm,
  maximum: INDIRECT_FIRE.rangeKm,
  seconds: Math.max(0, Math.ceil((order.emplacedAt - order.now) / 1000)),
});
