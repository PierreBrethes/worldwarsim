import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { modeOf } from '../../src/domain/season-mode';
import { theatreById, type Theatre } from '../../src/domain/theatres';

/** **The theatre a Blitz is played on**, `null` for a Mondiale: the one reading every Blitz rule
 *  of the movement starts from — slots, pace, rest window, the box an order may aim in, and every
 *  distance cut from its span (A2). */
export const seasonTheatre = (season: Doc<'seasons'> | null): Theatre | null =>
  season === null || modeOf(season.mode) !== 'blitz' || season.theatre === undefined
    ? null
    : theatreById(season.theatre);

export async function blitzTheatreOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Theatre | null> {
  const player = await ctx.db.get(playerId);
  return seasonTheatre(player === null ? null : await ctx.db.get(player.seasonId));
}
