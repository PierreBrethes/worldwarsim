import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { topUp, type SupplyStocks } from '../src/domain/supplies';
import { isBlitz } from './blitz';
import { movementsOf } from './movement/forces';
import { debit, economyOf } from './resources';
import { upkeepOf } from './upkeep';

/**
 * **Ancrée, une troupe se recharge ; ailleurs, elle vit sur ce qu'elle porte** (ADR 0028 §3).
 * La lecture de l'ancre est celle de l'entretien (`upkeepOf`), et une troupe sur la route n'est
 * ancrée nulle part. Elle se sert sur le plateau personnel, sur le sol national comme dans le
 * rayon d'un avant-poste : le dépôt d'avant-poste n'existe pas encore (feature 4.7).
 *
 * La Blitz ne compte rien : elle tire et roule sans compter.
 */
export async function toppedUp(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  at: number,
): Promise<{ readonly troops: Array<Doc<'troops'>>; readonly cost: SupplyStocks }> {
  const none = { troops: [...troops], cost: { ammunition: 0, oil: 0, coal: 0 } };
  const player = await ctx.db.get(playerId);
  if (player === null || troops.length === 0 || (await isBlitz(ctx, player.seasonId))) return none;
  const unsupplied = new Set<string>((await upkeepOf(ctx, playerId, at)).unsuppliedTroopIds);
  const marching = new Set<string>(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  const anchored = (troop: Doc<'troops'>) => !unsupplied.has(troop._id) && !marching.has(troop._id);
  if (!troops.some(anchored)) return none;
  const { stocks } = await economyOf(ctx, playerId, at);
  const { supplies, cost } = topUp(
    troops.map((troop) => ({ ...troop, id: troop._id, anchored: anchored(troop) })),
    stocks,
  );
  return {
    troops: troops.map((troop) => {
      const refill = supplies.get(troop._id);
      return refill === undefined ? troop : { ...troop, ...refill };
    }),
    cost,
  };
}

/** La recharge écrite : le plateau personnel paie, la troupe garde ses crans. */
export async function resupply(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  at: number,
): Promise<Array<Doc<'troops'>>> {
  const { troops: next, cost } = await toppedUp(ctx, playerId, troops, at);
  if (cost.ammunition + cost.oil + cost.coal === 0) return next;
  await debit(ctx, playerId, cost, at);
  for (const [index, troop] of next.entries())
    if (troop.rounds !== troops[index]!.rounds || troop.fuel !== troops[index]!.fuel)
      await ctx.db.patch(troop._id, { rounds: troop.rounds, fuel: troop.fuel });
  return next;
}
