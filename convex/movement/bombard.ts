/**
 * **Le tir indirect** (B20, lot 6b) : l'artillerie frappe sur-le-champ une unité en vue, sans
 * mouvement, sans riposte et sans poursuite. La règle est `bombardRefusalOf`, la même que la rose.
 * **En Mondiale** (4.10), la salve paie un cran et touche jusqu'à quatre troupes de l'escouade
 * visée (`salvoOf`) ; la Blitz, sans escouade, ne frappe que sa cible.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
  bombardRefusalDetails,
  bombardRefusalOf,
  emplacedAt,
} from '../../src/domain/indirect-fire';
import { COMBAT_RULES, RELOAD_SECONDS_BY_ROLE } from '../constants';
import { combatantOf, resolveContact } from '../combat';
import { salvoOf } from '../../src/domain/combat';
import { outOfRounds } from '../../src/domain/supplies';
import { toppedUp } from '../supplies';
import { fail } from '../errors';
import { hostAtPoint, landAtPoint } from '../routes';
import { forgetMovement, walkHome } from './arrival';
import { reassessDetection } from './detection';
import { asPoint, movementsOf, seatedOf, stanceOf, standingPile } from './forces';
import { carrierIn } from '../../src/domain/troops';
import { quarryOf } from './pursuit';
import { blitzTheatreOf } from './theatre';

export type BombardTarget =
  | { readonly kind: 'camp'; readonly campId: Id<'campSightings'> }
  | { readonly kind: 'track'; readonly movementId: Id<'movements'> };

/** L'instant où cette pièce est en batterie : depuis son dernier arrêt, ou sa formation. */
export const batteryReadyAt = (troop: Doc<'troops'>): number =>
  emplacedAt(troop.settledAt ?? troop._creationTime);

/** **Ce qui se tient avec cette troupe** : sa colonne, ou les siens à la même adresse. */
async function pileOf(ctx: MutationCtx, victim: Doc<'troops'>): Promise<Array<Doc<'troops'>>> {
  const carrying = (await movementsOf(ctx, victim.playerId)).find((movement) =>
    movement.troopIds.includes(victim._id),
  );
  const ids = carrying?.troopIds ?? [];
  const together =
    carrying === undefined
      ? await standingPile(ctx, victim.playerId, victim.stationedAt)
      : (await Promise.all(ids.map((id) => ctx.db.get(id)))).flatMap((one) =>
          one === null ? [] : [one],
        );
  return together.filter((one) => one._id !== victim._id && one.playerId === victim.playerId);
}

export async function bombard(
  ctx: MutationCtx,
  player: Doc<'players'>,
  troopId: Id<'troops'>,
  target: BombardTarget,
): Promise<{ readonly engagementId: Id<'engagements'> }> {
  const now = Date.now();
  const troop = await ctx.db.get(troopId);
  if (troop === null || troop.playerId !== player._id) fail('UNKNOWN_TROOP');
  const theatre = await blitzTheatreOf(ctx, player._id);
  const moving = (await movementsOf(ctx, player._id)).some((movement) =>
    movement.troopIds.includes(troopId),
  );
  const stance = moving ? null : await stanceOf(ctx, troop.stationedAt);
  /** **La vue du joueur à l'instant**, comme la poursuite : un relevé que plus rien ne tient
   *  n'est pas une cible. */
  await reassessDetection(ctx, troop.seasonId, now);
  const quarry = await quarryOf(ctx, player._id, target, now);
  const address = troop.stationedAt;
  const onPoint = address !== null && typeof address !== 'string';
  /** Ses crans après la recharge à l'ancre, comme la passe les lira. */
  const [armed] = (await toppedUp(ctx, player._id, [troop], now)).troops;
  const order = {
    roles: [troop.role],
    from: stance?.point ?? quarry.point,
    to: quarry.point,
    theatre,
    seen: true,
    emplacedAt: batteryReadyAt(troop),
    reloadUntil: troop.reloadUntil ?? null,
    moving,
    aboard:
      !moving &&
      ((onPoint && !landAtPoint([address.lon, address.lat])) ||
        carrierIn(seatedOf(troop), (await pileOf(ctx, troop)).map(seatedOf)) !== null),
    outOfRounds: theatre === null && outOfRounds([armed!]),
    now,
  };
  const refusal = bombardRefusalOf(order);
  if (refusal !== null || stance === null)
    fail(refusal ?? 'UNKNOWN_TROOP', bombardRefusalDetails(order));

  const victim = (await ctx.db.get(quarry.troopId))!;
  const pile = await pileOf(ctx, victim);
  /** Seules les troupes touchées entrent dans la passe : le tireur n'apprend rien du reste. */
  const struck =
    theatre === null
      ? salvoOf(
          combatantOf(troop),
          [victim, ...pile].map((one) => ({ ...combatantOf(one), troop: one })),
          COMBAT_RULES,
        ).map((one) => one.troop)
      : [victim];
  const { engagementId, engagement, routed, routedCargo } = await resolveContact(ctx, {
    seasonId: troop.seasonId,
    attacker: { playerId: player._id, troops: [troop] },
    defender: { playerId: victim.playerId, troops: struck },
    cause: 'bombardment',
    point: asPoint(quarry.point),
    hostCountry: hostAtPoint(quarry.point),
    outpostId: null,
    disabledUntil: null,
    at: now,
    mode: 'indirect',
    firedFrom: asPoint(stance.point),
    aboard: [victim, ...pile].filter((one) => !struck.includes(one)),
  });
  await ctx.db.patch(troop._id, { reloadUntil: now + RELOAD_SECONDS_BY_ROLE[troop.role] * 1000 });

  /** **Ce qui tombe ou rompt quitte sa colonne** : un déroulé rentre seul (la Mondiale déroute,
   *  la Blitz jamais), et une colonne vidée n'a plus rien à porter. */
  const gone = new Set(
    engagement.outcomes
      .filter((outcome) => outcome.state !== 'standing')
      .map((outcome) => outcome.id),
  );
  const carrying = (await movementsOf(ctx, victim.playerId)).find((movement) =>
    movement.troopIds.includes(victim._id),
  );
  const left = carrying?.troopIds.filter((id) => !gone.has(id)) ?? [];
  if (carrying !== undefined && left.length === 0) await forgetMovement(ctx, carrying._id, now);
  else if (carrying !== undefined && left.length < carrying.troopIds.length)
    await ctx.db.patch(carrying._id, { troopIds: left });
  if (routed.length > 0)
    await walkHome(ctx, { winners: [], beaten: routed }, quarry.point, now, routedCargo);
  await reassessDetection(ctx, troop.seasonId, now);
  return { engagementId };
}
