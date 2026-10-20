import { LISTENING_STATION_RADIUS_KM, contactKm, detectionRangeOf } from '../../convex/constants';
import type { BuildingKey, UnitRole } from './ids';
import { fireReachOf, firesIndirect } from './indirect-fire';
import { positionAt } from './interception';
import { rangoonReachOf, type Reach } from './labels';
import type { ArcView, PlayerView, TroopStation } from './player-view';
import { isRangoonColumn } from './strategic-points';
import type { Theatre } from './theatres';
import { stationKeyOf, stationPointOf, troopsAt } from './troops';
import type { ArmedColumn } from './armed-column';
import type { LonLat } from './geo';

/**
 * **Le cercle de détection de la pièce en main** (ADR 0019 §5) : le seul détecteur qui soit
 * une troupe, et le seul chiffre qui dise ce que la poser rapporte. Il part avec la main.
 */
export function handReachOf(
  me: PlayerView['me'],
  column: ArmedColumn | null,
  theatre: Theatre | null,
): Reach | null {
  if (column === null) return null;
  /** **L'artillerie levée montre où elle tire** (B20) : la portée et la zone morte, de sa
   *  batterie — un bâtiment compris, d'où elle tire aussi. */
  const firing = column.rule.roles.some(firesIndirect);
  if (!firing && column.station.kind !== 'point') return null;
  const at = stationPointOf(me, column.station);
  if (at === null) return null;
  return {
    lonLat: at,
    detectionKm: detectionRangeOf(column.rule.roles, theatre),
    /** **Ce qu'elle touche, à côté de ce qu'elle voit** (décisions 4a et 3a du 16/09) :
     *  une seule règle, celle que l'arrivée lit pour trouver qui se tient là. */
    contactKm: firing ? null : contactKm(theatre),
    ...(firing ? { fire: fireReachOf(theatre) } : {}),
  };
}

export function movementReachOf(
  view: PlayerView,
  movementId: string | null,
  now: number,
  theatre: Theatre | null,
): Reach | null {
  const movement = view.arcs.find(
    (arc): arc is Extract<ArcView, { state: 'mine' }> =>
      arc.state === 'mine' && arc.id === movementId,
  );
  if (movement === undefined) return null;
  const roles = (Object.entries(movement.stack) as ReadonlyArray<[UnitRole, number | undefined]>)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([role]) => role);
  const elapsed = Math.max(0, now - view.loadedAt);
  const progress =
    movement.progress >= 1 || movement.minutesLeft <= 0
      ? 1
      : Math.min(
          1,
          movement.progress + ((1 - movement.progress) * elapsed) / (movement.minutesLeft * 60_000),
        );
  const lonLat = positionAt(
    {
      id: movement.id,
      points: movement.route.points,
      legs: movement.route.legs,
      distanceUnits: movement.route.distanceUnits,
      landCost: movement.route.landCost,
      departedAt: 0,
      arrivesAt: 1,
    },
    progress,
  );
  return isRangoonColumn(
    movement.troopIds,
    (id) => view.me.troops.find((troop) => troop.id === id)?.tour?.veiled === true,
  )
    ? rangoonReachOf(lonLat)
    : {
        lonLat,
        detectionKm: detectionRangeOf(roles, theatre),
        contactKm: contactKm(theatre),
      };
}

/**
 * **Une tournée de Rangoun à l'arrêt** montre au survol de son mât l'anneau d'où on la relève,
 * comme en route : la pile entière en tournée, la même règle que le serveur (`isRangoonColumn`).
 */
export const withRangoonPile = (
  me: PlayerView['me'],
  station: TroopStation,
  marching: ReadonlySet<string>,
  lonLat: LonLat,
  reach: Reach | null,
): Reach | null =>
  isRangoonColumn(
    troopsAt(me, stationKeyOf(station), marching),
    (troop) => troop.tour?.veiled === true,
  )
    ? rangoonReachOf(lonLat, reach)
    : reach;

/** A station is the one building whose radius is a rule (`LISTENING_STATION_RADIUS_KM`); every
 *  other one covers nothing, and a region the view does not carry has no point to draw around. */
export const reachOfStation = (key: BuildingKey, point: LonLat | undefined): Reach | null =>
  key === 'listening' && point !== undefined
    ? { lonLat: point, detectionKm: LISTENING_STATION_RADIUS_KM, contactKm: null }
    : null;
