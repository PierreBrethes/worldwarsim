import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { windowExit } from '../../src/domain/rest-window';
import { homeCountryOf } from '../regions';
import { blitzTheatreOf } from './theatre';

/** The rest window belongs to the player whose national ground receives the arrival. */
export async function restHold(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  hostCountry: string,
  at: number,
): Promise<number | null> {
  const owner = await ctx.db.get(playerId);
  if (!owner) return null;
  /** **Pas de plage de repos en Blitz** (B2) : la table est présente, à heure convenue. */
  if ((await blitzTheatreOf(ctx, playerId)) !== null) return null;
  const host = (
    await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', owner.seasonId))
      .collect()
  ).find(
    (player) =>
      player._id !== owner._id &&
      (player.eliminatedAt ?? null) === null &&
      homeCountryOf(player.nation) === hostCountry,
  );
  return host ? windowExit(at, host.restWindow) : null;
}
