import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { windowExit } from '../../src/domain/rest-window';
import { homeCountryOf } from '../regions';

/** The rest window belongs to the player whose national ground receives the arrival. */
export async function restHold(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  hostCountry: string,
  at: number,
): Promise<number | null> {
  const owner = await ctx.db.get(playerId);
  if (!owner) return null;
  const host = (
    await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', owner.seasonId))
      .collect()
  ).find((player) => player._id !== owner._id && homeCountryOf(player.nation) === hostCountry);
  return host ? windowExit(at, host.restWindow) : null;
}
