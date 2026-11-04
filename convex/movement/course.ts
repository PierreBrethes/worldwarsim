/**
 * **Changer de cap** (Doctrine du porte-avions, ADR 0039 §4). Un mouvement en vol ne se recourbe
 * pas (`bendTowards` réécrirait le passé que d'autres ont vu) : l'ancien s'oublie comme une
 * colonne qui s'arrête (`forgetMovement`, le tronçon vu se fige), et un mouvement neuf part de la
 * position du moment, refusé par la même fonction qu'un ordre neuf, le plein relu pour la route
 * neuve. Le slot ne se reprend pas : il était tenu, il le reste.
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail } from '../errors';
import { movementCargoFields, movementCargoLoads } from '../cargo';
import { holdsPoint } from '../strategicPoints';
import { routeBetween } from '../routes';
import { storesCrossed } from '../supplies';
import { reassessDetection, marchingForce } from './detection';
import { forgetMovement } from './arrival';
import { pacedMinutes } from './pace';
import { aimOf, columnOf, departureOf, fuelBill, type AimTarget } from './orders';
import { asPoint } from './forces';
import { assetOf } from '../../src/domain/nation-assets';
import { modeOf } from '../../src/domain/season-mode';
import {
  courseRefusalOf,
  fuelAfterCourse,
  fuelCreditOf,
} from '../../src/domain/carrier-doctrine';
import { distanceProgressAt, positionAt } from '../../src/domain/interception';
import {
  isQuay,
  landCostOf,
  refusalDetails,
  refusalOf,
  routeModeOf,
} from '../../src/domain/movement-orders';
import { kmOf } from '../../src/domain/routing';
import { seenSegment } from '../../src/domain/sighting-segment';
import { fuelGaugeOf, fuelRefusalOf, suppliesOf } from '../../src/domain/supplies';

export type Steered = 'march' | 'attack' | 'raid';

/** **Ce qu'une mission accroche à un mouvement** : il garde alors son cap (décision du 04/11). */
export const onMission = (movement: Doc<'movements'>): boolean =>
  movement.plunder !== undefined ||
  movement.capture !== undefined ||
  movement.delivery !== undefined ||
  movement.airdrop !== undefined ||
  movement.lootCollection !== undefined ||
  movement.lootDelivery !== undefined ||
  movement.tourLeg !== undefined ||
  movement.patrolLeg !== undefined ||
  movement.pursuit !== undefined ||
  movement.boardsOn !== undefined;

/** Le refus du cap, lu sur la ligne comme la vue le sert à son auteur. */
export const courseRefusalOfRow = (
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  movement: Doc<'movements'>,
  now: number,
) =>
  courseRefusalOf(
    assetOf(player.nation ?? null, modeOf(season.mode)),
    {
      type: movement.type,
      onMission: onMission(movement),
      courseChangedAt: movement.courseChange?.at ?? null,
      force: marchingForce(movement),
    },
    now,
  );

/**
 * **Le cap neuf, pesé** : la porte de l'atout, puis celle d'un ordre neuf depuis la position du
 * moment, la route et le plein. L'aperçu le lit et rend `null` sur un refus ; la mutation le lit
 * et échoue du même mot.
 */
export async function plotCourse(
  ctx: QueryCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  movementId: Id<'movements'>,
  type: Steered,
  target: AimTarget,
  now: number,
) {
  const movement = await ctx.db.get(movementId);
  if (movement === null || movement.playerId !== player._id) fail('UNKNOWN_MOVEMENT');
  const refusal = courseRefusalOfRow(player, season, movement, now);
  if (refusal !== null) fail(refusal);

  const force = marchingForce(movement);
  const here = positionAt(force, now);
  const departure = (await departureOf(ctx, player._id, { kind: 'point', point: asPoint(here) }))!;
  const troops = (await Promise.all(movement.troopIds.map((id) => ctx.db.get(id)))).filter(
    (troop): troop is Doc<'troops'> => troop !== null,
  );
  const column = await columnOf(ctx, player._id, troops, departure);
  const aimed = await aimOf(ctx, player._id, target);
  const ordered = refusalOf(type, aimed.aim, column);
  if (ordered !== null) fail(ordered, { type, ...refusalDetails(aimed.aim, column) });

  const route = routeBetween(
    here,
    aimed.point,
    routeModeOf(column.roles),
    landCostOf(column.roles),
    isQuay(aimed.aim),
  );
  if (route === null) fail('NO_LAND_ROUTE', { from: departure.name, to: aimed.name });

  /** **La part non courue compte comme payée** : chaque moteur paie la route neuve d'abord
   *  avec elle, puis avec ce qu'il porte, par la même jauge et le même refus qu'un départ. */
  const singapore = await holdsPoint(ctx, player, 'singapore');
  const bill = fuelBill(troops, route.distanceUnits, false, false, singapore);
  const paidKm = kmOf(movement.distanceUnits);
  const ranKm = kmOf(movement.distanceUnits * distanceProgressAt(force, now));
  const creditOf = (troop: Doc<'troops'>) =>
    fuelCreditOf(troop.role, paidKm, ranKm, singapore);
  const drivers = bill.drivers.map((troop) => ({ ...troop, credit: creditOf(troop) }));
  const short = fuelRefusalOf(drivers, bill.km, singapore);

  const minutes = await pacedMinutes(ctx, player._id, route, now);
  return {
    movement,
    troops,
    column,
    here,
    aimed,
    route,
    minutes,
    arrivesAt: now + minutes * 60_000,
    departureName: departure.name,
    fuel: {
      gauge: fuelGaugeOf(drivers, bill.km, singapore),
      short,
      km: bill.km,
      eased: bill.eased,
      /** Le plein qui restera à chaque moteur, le surplus pris, le crédit en trop perdu. */
      after: new Map(
        bill.drivers.map((troop) => [
          troop._id,
          fuelAfterCourse(suppliesOf(troop).fuel, creditOf(troop), bill.stepsOf(troop)),
        ]),
      ),
    },
  };
}

/** **Le coude** : l'ancien mouvement s'oublie, le neuf part d'ici, et le brouillard se relit. */
export async function changeCourse(
  ctx: MutationCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  movementId: Id<'movements'>,
  type: Steered,
  target: AimTarget,
) {
  const now = Date.now();
  const plan = await plotCourse(ctx, player, season, movementId, type, target, now);
  const { movement, here, aimed, route, arrivesAt, fuel } = plan;
  if (fuel.short !== null) fail('NOT_ENOUGH_FUEL', { ...fuel.short, km: fuel.km, roundTrip: false });

  const ran = seenSegment(marchingForce(movement), movement.departedAt, now).points;
  for (const troop of plan.troops)
    await ctx.db.patch(troop._id, {
      ...(fuel.after.has(troop._id) ? { fuel: fuel.after.get(troop._id)! } : {}),
      fuelAt: arrivesAt,
    });
  await forgetMovement(ctx, movement._id, now);
  const turnedId = await ctx.db.insert('movements', {
    seasonId: movement.seasonId,
    playerId: player._id,
    type,
    fromBuildingId: movement.fromBuildingId,
    target: aimed.target,
    from: asPoint(here),
    to: asPoint(aimed.point),
    hostCountry: aimed.host,
    points: route.points.map(asPoint),
    legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
    distanceUnits: route.distanceUnits,
    costUnits: route.costUnits,
    landCost: route.landCost,
    troopIds: movement.troopIds,
    departedAt: now,
    arrivesAt,
    ...(aimed.aim.kind === 'objective'
      ? { objectiveId: aimed.aim.objectiveId as Id<'objectives'> }
      : {}),
    ...movementCargoFields(movementCargoLoads(movement)),
    courseChange: { at: now, ran: ran.map(asPoint) },
  });
  await storesCrossed(ctx, turnedId);
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId: turnedId });
  await ctx.db.insert('notices', {
    playerId: player._id,
    at: now,
    kind: 'courseChanged',
    hostCountry: aimed.host,
    arrivesAt,
  });
  /** **Comme un départ** : qui guette voit la colonne repartir de sa position. */
  await reassessDetection(ctx, movement.seasonId, now, player._id);
  return { movementId: turnedId, minutes: plan.minutes, arrivesAt };
}
