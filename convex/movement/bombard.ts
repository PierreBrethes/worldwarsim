/**
 * **Le tir indirect** (B20, lot 6b) : l'artillerie frappe sur-le-champ une unité en vue, sans
 * mouvement, sans riposte et sans poursuite. La règle est `bombardRefusalOf`, la même que la rose.
 */

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { bombardRefusalOf } from '../../src/domain/indirect-fire';
import { RELOAD_SECONDS_BY_ROLE } from '../constants';
import { resolveContact } from '../combat';
import { fail } from '../errors';
import { hostAtPoint } from '../routes';
import { forgetMovement } from './arrival';
import { reassessDetection } from './detection';
import { asPoint, movementsOf, stanceOf } from './forces';
import { quarryOf } from './pursuit';
import { blitzTheatreOf } from './theatre';

export type BombardTarget =
  | { readonly kind: 'camp'; readonly campId: Id<'campSightings'> }
  | { readonly kind: 'track'; readonly movementId: Id<'movements'> };

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
  const quarry = await quarryOf(ctx, player._id, target, now);
  /** Une pièce en route n'est pas en batterie : elle se compte immobile depuis maintenant. */
  const refusal = bombardRefusalOf({
    roles: [troop.role],
    from: stance?.point ?? quarry.point,
    to: quarry.point,
    theatre,
    seen: true,
    settledAt: stance === null ? now : (troop.settledAt ?? troop._creationTime),
    reloadUntil: troop.reloadUntil ?? null,
    now,
  });
  if (refusal !== null || stance === null) fail(refusal ?? 'NOT_EMPLACED');

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
