import { BLITZ_SHARE, INDIRECT_FIRE } from '../../convex/constants';
import { withinTheatre } from './blitz';
import { distanceKm, type LonLat } from './geo';
import type { UnitRole } from './ids';
import { theatreKm, type Theatre } from './theatres';
import { LIFT_CAPACITY } from './troops';

/**
 * **Le tir indirect** (B20, lot 6b) : l'artillerie frappe de loin une unité en vue, sans riposte
 * reçue ni donnée, et ne tire pas au contact. Une seule règle pour la rose et pour
 * `movements.bombard` ; les nombres vivent dans `INDIRECT_FIRE`.
 */
export const firesIndirect = (role: UnitRole): boolean => role === 'artillery';

/** Où la pièce tire, en km de son théâtre (A2) : la règle, l'aperçu et les cercles le lisent. */
export const fireReachOf = (theatre: Theatre) => ({
  rangeKm: theatreKm(theatre, BLITZ_SHARE.fireRange),
  deadZoneKm: theatreKm(theatre, BLITZ_SHARE.deadZone),
});

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
  const { rangeKm, deadZoneKm } = fireReachOf(theatre);
  if (km < deadZoneKm) return 'TOO_CLOSE';
  return km > rangeKm ? 'OUT_OF_RANGE' : null;
}

/** Ce que la phrase du refus nomme — distance, bornes, attente —, la même des deux côtés. */
export const bombardRefusalDetails = (order: Bombardment) => {
  const reach = order.theatre === null ? null : fireReachOf(order.theatre);
  return {
    km: Math.round(distanceKm(order.from, order.to)),
    minimum: reach?.deadZoneKm ?? 0,
    maximum: reach?.rangeKm ?? 0,
    seconds: Math.max(0, Math.ceil((order.emplacedAt - order.now) / 1000)),
  };
};
