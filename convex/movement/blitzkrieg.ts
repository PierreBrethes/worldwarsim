/**
 * **La Guerre éclair** (ADR 0039 §6) : une attaque allemande à terre porte deux cibles. La seconde
 * se pèse à l'ordre depuis le point de la première ; à l'arrivée, si l'attaquant tient le terrain,
 * les vainqueurs s'y posent et repartent vers elle sous le même slot, comme un pas de tournée
 * (`march(…, { keepsSlot: true })`), avant l'unique réévaluation de l'arrivée.
 *
 * **Rien n'échoue à l'échéance** : la cible, les coups, la route et le plein se lisent comme des
 * valeurs (`weighSecondLeg`) avant `march` ; si l'un manque, la colonne reste sur place et le dit.
 * Le plein se montre à l'ordre et ne s'y refuse pas : le point de la première cible peut le
 * combler (`toppedUp`), et il se relit au départ (décision de l'orchestrateur du 05/11).
 */

import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { fail, type ErrorCode } from '../errors';
import { stationCargoLoads, type HomewardCargo } from '../cargo';
import { regionNameAt } from '../placeNames';
import { routeBetween } from '../routes';
import { holdsPoint } from '../strategicPoints';
import { toppedUp } from '../supplies';
import { surveyFromPoint } from '../surveys';
import { forgetMovement, standAt } from './arrival';
import { watchersOf } from './detection';
import { asPoint, pointOf } from './forces';
import {
  aimOf,
  columnOf,
  departureOf,
  fuelBill,
  march,
  troopsAmong,
  type AimTarget,
} from './orders';
import { secondTargetRefusalOf } from '../../src/domain/blitzkrieg';
import type { LonLat } from '../../src/domain/geo';
import type { MovementAim } from '../../src/domain/movement-orders';
import { isQuay, landCostOf, refusalDetails, routeModeOf } from '../../src/domain/movement-orders';
import { assetOf } from '../../src/domain/nation-assets';
import type { RouteLeg } from '../../src/domain/routing';
import { modeOf } from '../../src/domain/season-mode';

type Refused = { readonly refusal: { readonly code: ErrorCode; readonly details: Details } };
type Details = Record<string, string | number | boolean>;

/**
 * **La seconde jambe, pesée** depuis le point de la première, pour ces troupes-là : un refus
 * comme une valeur, ou la visée, la route et le plein. L'ordre en fait un échec, l'aperçu une
 * ligne de la pastille, le départ une colonne qui reste. `first.aim` manque au départ : l'ordre a
 * déjà dit que les deux cibles différaient. `departing` : le départ seul refuse un plein court.
 */
export async function weighSecondLeg(
  ctx: QueryCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  first: {
    readonly aim?: MovementAim;
    readonly point: LonLat;
    readonly legs: ReadonlyArray<RouteLeg>;
  },
  then: AimTarget,
  troops: ReadonlyArray<Doc<'troops'>>,
  departing = false,
) {
  const refused = (code: ErrorCode, details: Details = {}): Refused => ({
    refusal: { code, details },
  });
  const departure = (await departureOf(ctx, player._id, {
    kind: 'point',
    point: asPoint(first.point),
  }))!;
  const column = await columnOf(ctx, player._id, troops, departure);
  /** **La cible relue** : un relevé perdu, un camp levé se disent comme à l'ordre, en valeur. */
  const aimed = await aimOf(ctx, player._id, then).catch((error: unknown) => {
    if (!(error instanceof ConvexError)) throw error;
    const { code, ...details } = error.data as { code: ErrorCode } & Details;
    return refused(code, details);
  });
  if ('refusal' in aimed) return aimed;
  const asset = assetOf(player.nation ?? null, modeOf(season.mode));
  const refusal = secondTargetRefusalOf(asset, first, aimed.aim, column);
  if (refusal !== null) return refused(refusal, refusalDetails(aimed.aim, column) as Details);

  const route = routeBetween(
    departure.point,
    aimed.point,
    routeModeOf(column.roles),
    landCostOf(column.roles),
    isQuay(aimed.aim),
  );
  if (route === null) return refused('NO_LAND_ROUTE', { from: departure.name, to: aimed.name });

  const fuel = fuelBill(
    [...troops],
    route.distanceUnits,
    false,
    false,
    await holdsPoint(ctx, player, 'singapore'),
  );
  if (departing && fuel.short !== null)
    return refused('NOT_ENOUGH_FUEL', { ...fuel.short, km: fuel.km, roundTrip: false });
  return { aimed, route, fuel, column };
}

/** **À l'ordre** : la seconde cible se refuse d'un mot, et rien ne part (l'ordre est entier). */
export async function chainSecondTarget(
  ctx: MutationCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  movementId: Id<'movements'>,
  first: MovementAim,
  then: NonNullable<Doc<'movements'>['blitzkrieg']>['then'],
) {
  const movement = (await ctx.db.get(movementId))!;
  const leg = await weighSecondLeg(
    ctx,
    player,
    season,
    { aim: first, point: pointOf(movement.to), legs: movement.legs },
    then,
    await troopsAmong(ctx, player._id, movement.troopIds),
  );
  if ('refusal' in leg) fail(leg.refusal.code, leg.refusal.details);
  await ctx.db.patch(movementId, {
    blitzkrieg: {
      then,
      point: asPoint(leg.aimed.point),
      hostCountry: leg.aimed.host,
      points: leg.route.points.map(asPoint),
    },
  });
}

const nameAt = (point: LonLat, hostCountry: string) => regionNameAt(point) ?? hostCountry;

/**
 * **Après la première attaque** : `held` sont les vainqueurs et ce qu'ils portent, `null` sur une
 * défaite (ils sont déjà rentrés, `engageAt`). Rend le mouvement neuf et ceux qui guettaient
 * l'ancien, pour l'unique réévaluation de l'arrivée ; `null` si rien ne repart.
 */
export async function pressOn(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  held: {
    readonly winners: ReadonlyArray<Doc<'troops'>>;
    readonly cargo: ReadonlyArray<HomewardCargo>;
  } | null,
  now: number,
): Promise<{
  readonly movementId: Id<'movements'>;
  readonly by: ReadonlySet<Id<'players'>>;
} | null> {
  const chain = movement.blitzkrieg!;
  const here = pointOf(movement.to);
  const tell = (fields: {
    outcome: 'onward' | 'lost' | 'halted';
    arrivesAt?: number;
    refusal?: string;
    details?: Details;
  }) =>
    ctx.db.insert('notices', {
      playerId: movement.playerId,
      at: now,
      kind: 'blitzkrieg',
      hostCountry: movement.hostCountry,
      point: movement.to,
      name: nameAt(here, movement.hostCountry),
      then: {
        hostCountry: chain.hostCountry,
        point: chain.point,
        name: nameAt(pointOf(chain.point), chain.hostCountry),
      },
      ...fields,
    });
  /** Une colonne toute en déroute ne gagne pas : la victoire laisse toujours un vainqueur. */
  if (held === null) {
    await tell({ outcome: 'lost' });
    return null;
  }

  /** **Les vainqueurs tiennent le terrain** : posés au point, leur charge avec eux (la cargaison
   *  suit la colonne), avant que l'ancien mouvement ne s'oublie. */
  const winnerIds = held.winners.map((troop) => troop._id);
  const emptied = (await ctx.db.get(movement._id))!;
  await standAt(ctx, { ...emptied, troopIds: winnerIds }, movement.to);
  await stationCargoLoads(ctx, {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    troopIds: winnerIds,
    stationedAt: movement.to,
    loads: held.cargo.flatMap((load) => load.loads),
  });
  /** Guettée jusqu'au bout : la fenêtre se ferme à l'arrivée, que le job lit un instant après. */
  const watching = await watchersOf(ctx, movement._id, movement.arrivesAt);
  await forgetMovement(ctx, movement._id, now);

  const player = (await ctx.db.get(movement.playerId))!;
  const season = (await ctx.db.get(movement.seasonId))!;
  const { troops } = await toppedUp(
    ctx,
    player._id,
    await troopsAmong(ctx, player._id, winnerIds),
    now,
  );
  const leg = await weighSecondLeg(
    ctx,
    player,
    season,
    { point: here, legs: movement.legs },
    chain.then,
    troops,
    true,
  );
  if ('refusal' in leg) {
    /** Le sol où elle s'est battue, relevé comme `walkHome` le fait pour qui rentre. */
    await surveyFromPoint(
      ctx,
      player._id,
      here,
      now,
      troops.map((troop) => troop.role),
    );
    await tell({ outcome: 'halted', refusal: leg.refusal.code, details: leg.refusal.details });
    return null;
  }
  const sent = await march(ctx, {
    playerId: player._id,
    season,
    type: 'attack',
    origin: { kind: 'point', point: movement.to },
    troopIds: winnerIds,
    aim: leg.aimed,
    keepsSlot: true,
  });
  await tell({ outcome: 'onward', arrivesAt: sent.arrivesAt });
  return { movementId: sent.movementId, by: watching };
}
