import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isStanding } from '../../src/domain/outposts';
import { relayedCostUnits } from '../../src/domain/route-timing';
import type { ComputedRoute } from '../../src/domain/routing';
import { RELAY_SPEED_MULTIPLIER, outpostReachKm, routeMinutes } from '../constants';
import { pointOf } from './forces';

/**
 * Design sheet 03, and the one road to a duration in the game: the departure and the preview both
 * come through here, so the hour on the card is the hour the movement will be dated at. ADR 0018
 * §3: the relays are read at departure, and a column that has left is not re-examined.
 */
export async function pacedMinutes(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  route: ComputedRoute,
  at: number,
): Promise<number> {
  const relays = (
    await ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  )
    .filter((outpost) => outpost.specialization === 'relay')
    /** Un chantier ne relaie pas : le point n'existe pas encore (révision du 15/09). */
    .filter((outpost) => isStanding(outpost, at))
    .filter((outpost) => outpost.disabledUntil === null || outpost.disabledUntil <= at)
    .map((outpost) => ({
      point: pointOf(outpost.point),
      reachKm: outpostReachKm(outpost.level),
    }));

  return routeMinutes(relayedCostUnits({ route, relays, multiplier: RELAY_SPEED_MULTIPLIER }));
}
