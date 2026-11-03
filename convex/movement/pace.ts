import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { drawnLiaisonsOf, isStanding, linkedRelays } from '../../src/domain/outposts';
import { relayedCostUnits, type Relay } from '../../src/domain/route-timing';
import type { ComputedRoute } from '../../src/domain/routing';
import { costMinutes } from '../../src/domain/pace';
import { RELAY_SPEED_MULTIPLIER, outpostReachKm } from '../constants';
import { pointOf } from './forces';
import { blitzTheatreOf } from './theatre';

/**
 * Design sheet 03, and the one road to a duration in the game: the departure and the preview both
 * come through here, so the hour on the card is the hour the movement will be dated at. ADR 0018
 * §3: the liaisons are read at departure (ADR 0037 §8), and a column that has left is not
 * re-examined.
 */
export async function pacedMinutes(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  route: ComputedRoute,
  at: number,
): Promise<number> {
  const relays = await liaisonRelaysOf(ctx, playerId, at);
  const costUnits = relayedCostUnits({ route, relays, multiplier: RELAY_SPEED_MULTIPLIER });
  /** **Une Blitz court à l'échelle de son théâtre** (B1), en secondes et non en minutes : un saut
   *  de cent kilomètres y dure une demi-minute, que l'arrondi de la Mondiale portait à une. */
  return costMinutes(costUnits, await blitzTheatreOf(ctx, playerId));
}

/** **Les points d'un joueur qui accélèrent ses colonnes à cet instant** (ADR 0037 §8). */
export async function liaisonRelaysOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  at: number,
): Promise<ReadonlyArray<Relay>> {
  return linkedRelays(await liaisonPointsOf(ctx, playerId, at));
}

/** **Les liaisons que sa carte trace à cet instant** (ADR 0037 §8, #376) : celles où une ronde
 *  tourne, lues comme le client les dessine (`drawnLiaisonsOf`). */
export async function drawnLiaisonsAt(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  at: number,
): Promise<Array<[Id<'outposts'>, Id<'outposts'>]>> {
  return drawnLiaisonsOf(await liaisonPointsOf(ctx, playerId, at));
}

async function liaisonPointsOf(ctx: QueryCtx, playerId: Id<'players'>, at: number) {
  return liaisonPointsAmong(
    await ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
    at,
  );
}

/** Ses points debout et en service — l'équivalent serveur d'`isOnWatch`. */
export const liaisonPointsAmong = (outposts: ReadonlyArray<Doc<'outposts'>>, at: number) =>
  outposts
    /** Un chantier n'est en liaison avec rien : le point n'existe pas encore (révision du 15/09). */
    .filter((outpost) => isStanding(outpost, at))
    .filter((outpost) => outpost.disabledUntil === null || outpost.disabledUntil <= at)
    .map((outpost) => ({
      id: outpost._id,
      point: pointOf(outpost.point),
      reachKm: outpostReachKm(outpost.level),
    }));
