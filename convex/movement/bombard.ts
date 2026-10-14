/**
 * **Le tir indirect** (B20, lot 6b) : l'artillerie frappe sur-le-champ une unité en vue, sans
 * mouvement, sans riposte et sans poursuite. La règle est `bombardRefusalOf`, la même que la rose.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
  aboardAt,
  bombardRefusalDetails,
  bombardRefusalOf,
  emplacedAt,
} from '../../src/domain/indirect-fire';
import { RELOAD_SECONDS_BY_ROLE } from '../constants';
import { resolveContact } from '../combat';
import { fail } from '../errors';
import { hostAtPoint, landAtPoint } from '../routes';
import { forgetMovement } from './arrival';
import { reassessDetection } from './detection';
import { asPoint, movementsOf, stanceOf } from './forces';
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
      ? await ctx.db
          .query('troops')
          .withIndex('byStation', (q) => q.eq('stationedAt', victim.stationedAt))
          .collect()
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
      aboardAt({
        onPoint,
        afloat: onPoint && !landAtPoint([address.lon, address.lat]),
        roles: (await pileOf(ctx, troop)).map((one) => one.role),
      }),
    now,
  };
  const refusal = bombardRefusalOf(order);
  if (refusal !== null || stance === null)
    fail(refusal ?? 'UNKNOWN_TROOP', bombardRefusalDetails(order));

  const victim = (await ctx.db.get(quarry.troopId))!;
  const { engagementId, engagement } = await resolveContact(ctx, {
    seasonId: troop.seasonId,
    attacker: { playerId: player._id, troops: [troop] },
    defender: { playerId: victim.playerId, troops: [victim] },
    cause: 'bombardment',
    point: asPoint(quarry.point),
    hostCountry: hostAtPoint(quarry.point),
    outpostId: null,
    disabledUntil: null,
    at: now,
    mode: 'indirect',
    firedFrom: asPoint(stance.point),
    aboard: await pileOf(ctx, victim),
  });
  await ctx.db.patch(troop._id, { reloadUntil: now + RELOAD_SECONDS_BY_ROLE[troop.role] * 1000 });

  /** Une colonne dont la seule troupe est tombée n'a plus rien à porter. */
  const destroyed = engagement.outcomes.some(
    (outcome) => outcome.id === victim._id && outcome.state === 'destroyed',
  );
  const carrying = (await movementsOf(ctx, victim.playerId)).find((movement) =>
    movement.troopIds.includes(victim._id),
  );
  if (destroyed && carrying !== undefined && carrying.troopIds.length === 1)
    await forgetMovement(ctx, carrying._id, now);
  await reassessDetection(ctx, troop.seasonId, now);
  return { engagementId };
}
