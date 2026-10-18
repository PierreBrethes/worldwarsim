import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { topUp, type Supplies, type SupplyStocks } from '../src/domain/supplies';
import { emptyLoad } from '../src/domain/logistics';
import { isBlitz } from './blitz';
import { movementsOf } from './movement/forces';
import { debit, economyOf } from './resources';
import { upkeepOf, type AnchorStore } from './upkeep';

/** Ce que la recharge prend à chaque ancre : le plateau personnel, ou le dépôt d'un avant-poste. */
type Bill = ReadonlyMap<AnchorStore, SupplyStocks>;

/**
 * **Ancrée, une troupe se recharge ; ailleurs, elle vit sur ce qu'elle porte** (ADR 0028 §3).
 * La lecture de l'ancre est celle de l'entretien (`upkeepOf`), et une troupe sur la route n'est
 * ancrée nulle part. Sur le sol national elle se sert au plateau personnel ; dans le rayon d'un
 * avant-poste, à son dépôt (`storeOf`). Chaque ancre se partage dans l'ordre des identifiants.
 *
 * La Blitz ne compte rien : elle tire et roule sans compter.
 */
export async function toppedUp(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  at: number,
): Promise<{ readonly troops: Array<Doc<'troops'>>; readonly bill: Bill }> {
  const none = { troops: [...troops], bill: new Map() };
  const player = await ctx.db.get(playerId);
  if (player === null || troops.length === 0 || (await isBlitz(ctx, player.seasonId))) return none;
  const { storeOf } = await upkeepOf(ctx, playerId, at);
  const marching = new Set<string>(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  const byStore = new Map<AnchorStore, Array<Doc<'troops'>>>();
  for (const troop of troops) {
    const store = storeOf.get(troop._id);
    if (store === undefined || marching.has(troop._id)) continue;
    byStore.set(store, [...(byStore.get(store) ?? []), troop]);
  }
  if (byStore.size === 0) return none;
  const refills = new Map<string, Supplies>();
  const bill = new Map<AnchorStore, SupplyStocks>();
  for (const [store, group] of byStore) {
    const { supplies, cost } = topUp(
      group.map((troop) => ({ ...troop, id: troop._id, anchored: true })),
      await stocksOf(ctx, playerId, store, at),
    );
    for (const [id, refill] of supplies) refills.set(id, refill);
    bill.set(store, cost);
  }
  return {
    troops: troops.map((troop) => {
      const refill = refills.get(troop._id);
      return refill === undefined ? troop : { ...troop, ...refill };
    }),
    bill,
  };
}

async function stocksOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  store: AnchorStore,
  at: number,
): Promise<SupplyStocks> {
  if (store === 'board') return (await economyOf(ctx, playerId, at)).stocks;
  return (await ctx.db.get(store))?.depot ?? emptyLoad();
}

/** La recharge écrite : chaque ancre paie, la troupe garde ses crans. */
export async function resupply(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  at: number,
): Promise<Array<Doc<'troops'>>> {
  const { troops: next, bill } = await toppedUp(ctx, playerId, troops, at);
  for (const [store, cost] of bill) {
    if (cost.ammunition + cost.oil + cost.coal === 0) continue;
    if (store === 'board') await debit(ctx, playerId, cost, at);
    else await takeFromDepot(ctx, store, cost);
  }
  for (const [index, troop] of next.entries())
    if (troop.rounds !== troops[index]!.rounds || troop.fuel !== troops[index]!.fuel)
      await ctx.db.patch(troop._id, { rounds: troop.rounds, fuel: troop.fuel });
  return next;
}

/** Le dépôt rend ce qu'on y prend ; il ne descend jamais sous zéro. */
export async function takeFromDepot(
  ctx: MutationCtx,
  outpostId: Id<'outposts'>,
  taken: SupplyStocks,
): Promise<void> {
  const outpost = await ctx.db.get(outpostId);
  if (outpost === null) return;
  const depot = outpost.depot ?? emptyLoad();
  await ctx.db.patch(outpostId, {
    depot: {
      ammunition: Math.max(0, depot.ammunition - taken.ammunition),
      oil: Math.max(0, depot.oil - taken.oil),
      coal: Math.max(0, depot.coal - taken.coal),
    },
  });
}
