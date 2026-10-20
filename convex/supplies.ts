import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  bakuRefuel,
  suppliesOf,
  topUp,
  type Supplies,
  type SupplyStocks,
} from '../src/domain/supplies';
import { emptyLoad, SUPPLY_KEYS } from '../src/domain/logistics';
import { isBlitz } from './blitz';
import { holdsPoint } from './strategicPoints';
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
 * **Bakou** (ADR 0032) : le teneur voit ses moteurs à l'arrêt, hors de toute ancre, reprendre un
 * cran de plein toutes les 12 h (`bakuRefuel`), à `at` — le gain se règle ici, avant toute
 * lecture ou écriture qui dépend du plein.
 *
 * La Blitz ne compte rien : elle tire et roule sans compter.
 */
export async function toppedUp(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  at: number,
): Promise<{
  readonly troops: Array<Doc<'troops'>>;
  readonly bill: Bill;
}> {
  const none = { troops: [...troops], bill: new Map() };
  const player = await ctx.db.get(playerId);
  if (player === null || troops.length === 0 || (await isBlitz(ctx, player.seasonId))) return none;
  const { storeOf } = await upkeepOf(ctx, playerId, at);
  const marching = new Set<string>(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  const baku = await holdsPoint(ctx, player, 'baku');
  const byStore = new Map<AnchorStore, Array<Doc<'troops'>>>();
  const refills = new Map<string, Supplies>();
  const bill = new Map<AnchorStore, SupplyStocks>();
  const refuelled = new Map<string, { readonly fuel: number; readonly fuelAt: number }>();
  for (const troop of troops) {
    if (marching.has(troop._id)) continue;
    const store = storeOf[troop._id];
    if (store === undefined) {
      if (!baku) continue;
      const held = suppliesOf(troop).fuel;
      const got = bakuRefuel(troop.role, held, bakuSince(troop), at);
      if (got.steps > 0) refuelled.set(troop._id, { fuel: held + got.steps, fuelAt: got.since });
      continue;
    }
    byStore.set(store, [...(byStore.get(store) ?? []), troop]);
  }
  if (byStore.size === 0 && refuelled.size === 0) return none;
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
      const gained = refuelled.get(troop._id);
      return { ...troop, ...refill, ...gained };
    }),
    bill,
  };
}

/** **L'heure d'où se compte un cran de Bakou** : la dernière arrivée ou le dernier gain, à
 *  défaut la formation. */
export const bakuSince = (troop: Doc<'troops'>): number => troop.fuelAt ?? troop._creationTime;

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
    if (
      troop.rounds !== troops[index]!.rounds ||
      troop.fuel !== troops[index]!.fuel ||
      troop.fuelAt !== troops[index]!.fuelAt
    )
      await ctx.db.patch(troop._id, {
        rounds: troop.rounds,
        fuel: troop.fuel,
        fuelAt: troop.fuelAt,
      });
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
  const left = { ...depot };
  for (const key of SUPPLY_KEYS) left[key] = Math.max(0, depot[key] - taken[key]);
  await ctx.db.patch(outpostId, { depot: left });
}
