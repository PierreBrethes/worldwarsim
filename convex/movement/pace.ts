import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isStanding } from '../../src/domain/outposts';
import { relayedCostUnits } from '../../src/domain/route-timing';
import type { ComputedRoute } from '../../src/domain/routing';
import { theatreMinutesPer1000Km } from '../../src/domain/blitz';
import {
  MINUTES_PER_1000_KM_ON_LAND,
  MINUTES_PER_ROUTE_UNIT,
  RELAY_SPEED_MULTIPLIER,
  outpostReachKm,
  routeMinutes,
} from '../constants';
import { pointOf } from './forces';
import { blitzTheatreOf } from './theatre';

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

  const costUnits = relayedCostUnits({ route, relays, multiplier: RELAY_SPEED_MULTIPLIER });
  /** **Une Blitz court à l'échelle de son théâtre** (B1), en secondes et non en minutes : un saut
   *  de cent kilomètres y dure une demi-minute, que l'arrondi de la Mondiale portait à une. */
  const theatre = await blitzTheatreOf(ctx, playerId);
  if (theatre === null) return routeMinutes(costUnits);
  const minutes =
    (costUnits * MINUTES_PER_ROUTE_UNIT * theatreMinutesPer1000Km(theatre)) /
    MINUTES_PER_1000_KM_ON_LAND;
  return Math.max(1, Math.round(minutes * 60)) / 60;
}
