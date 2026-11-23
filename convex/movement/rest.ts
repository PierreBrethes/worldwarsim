import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { windowExit } from '../../src/domain/rest-window';
import { homeCountryOf } from '../regions';
import { everySeatOf } from '../seats';
import { seasonTheatre } from './theatre';

/** The rest window belongs to the player whose national ground receives the arrival. */
export async function restHold(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  hostCountry: string,
  at: number,
): Promise<number | null> {
  const owner = await ctx.db.get(playerId);
  if (!owner) return null;
  const season = await ctx.db.get(owner.seasonId);
  return restHoldOf(owner, season, await everySeatOf(ctx, owner.seasonId), hostCountry, at);
}

/** `restHold` on what the caller already holds (`viewOf`): the rule is this one, a mutation
 *  keeps `restHold` and its fresh reads. `every` is `everySeatOf`, the irregular seat included. */
export function restHoldOf(
  owner: Doc<'players'>,
  season: Doc<'seasons'> | null,
  every: ReadonlyArray<Doc<'players'>>,
  hostCountry: string,
  at: number,
): number | null {
  /** **Pas de plage de repos en Blitz** (B2) : la table est présente, à heure convenue. */
  if (seasonTheatre(season) !== null) return null;
  const host = every.find(
    (player) =>
      player._id !== owner._id &&
      (player.eliminatedAt ?? null) === null &&
      homeCountryOf(player.nation) === hostCountry,
  );
  return host ? windowExit(at, host.restWindow) : null;
}
