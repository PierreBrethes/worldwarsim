import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { modeOf } from '../../src/domain/season-mode';
import { theatreById, type Theatre } from '../../src/domain/theatres';

/** **The theatre a Blitz is played on**, `null` for a Mondiale: the one reading every Blitz rule
 *  of the movement starts from — slots, pace, rest window, the box an order may aim in. */
export async function blitzTheatreOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Theatre | null> {
  const player = await ctx.db.get(playerId);
  const season = player === null ? null : await ctx.db.get(player.seasonId);
  if (season === null || modeOf(season.mode) !== 'blitz' || season.theatre === undefined)
    return null;
  return theatreById(season.theatre);
}
