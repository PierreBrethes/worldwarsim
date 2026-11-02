import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { MarchingForce } from '../src/domain/interception';
import { effectiveSpecialty, isStanding } from '../src/domain/outposts';
import {
  bakuGainOf,
  passingResupply,
  suppliesOf,
  topUp,
  type PassingStore,
  type Supplies,
  type SupplyStocks,
} from '../src/domain/supplies';
import { emptyLoad, SUPPLY_KEYS } from '../src/domain/logistics';
import { isBlitz } from './blitz';
import { inService } from './buildingReads';
import { outpostReachKm } from './constants';
import { marchingForce } from './movement/detection';
import { pointOf } from './movement/forces';
import { heldSinceOf } from './strategicPoints';
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
  const bakuSince = await heldSinceOf(ctx, player, 'baku');
  const byStore = new Map<AnchorStore, Array<Doc<'troops'>>>();
  const refills = new Map<string, Supplies>();
  const bill = new Map<AnchorStore, SupplyStocks>();
  const refuelled = new Map<string, { readonly fuel: number; readonly fuelAt: number }>();
  for (const troop of troops) {
    if (marching.has(troop._id)) continue;
    const store = storeOf[troop._id];
    if (store === undefined) {
      const got = bakuGainOf(
        { ...troop, createdAt: troop._creationTime },
        { heldSince: bakuSince, marching: false, anchored: false },
        at,
      );
      if (got !== null && got.steps > 0)
        refuelled.set(troop._id, { fuel: suppliesOf(troop).fuel + got.steps, fuelAt: got.since });
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

/** **Les Magasins du joueur qui agissent à `at`** (ADR 0037 §4) : debout, en service, Magasin et
 *  pas en chantier de changement (`effectiveSpecialty`). La vigie muette n'y change rien (§2). */
export async function activeStoresOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  at: number,
): Promise<Array<PassingStore<Id<'outposts'>>>> {
  return (
    await ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  )
    .filter(
      (outpost) =>
        effectiveSpecialty(outpost) === 'store' &&
        isStanding(outpost, at) &&
        inService(outpost.disabledUntil, at),
    )
    .map((outpost) => ({
      id: outpost._id,
      point: pointOf(outpost.point),
      reachKm: outpostReachKm(outpost.level),
      depot: outpost.depot ?? emptyLoad(),
    }));
}

/** **Ce que la colonne reprendra en passant**, en crans, à l'estimation du départ : le chip de la
 *  route le dit (ADR 0037 §4). */
export async function passingEstimate(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  force: MarchingForce,
  troops: ReadonlyArray<Doc<'troops'>>,
): Promise<{ readonly rounds: number; readonly fuel: number }> {
  const takes = passingResupply(
    force,
    await activeStoresOf(ctx, playerId, force.departedAt),
    troops.map((troop) => ({ ...troop, id: troop._id })),
  );
  return {
    rounds: takes.reduce((sum, take) => sum + take.steps.rounds, 0),
    fuel: takes.reduce((sum, take) => sum + take.steps.fuel, 0),
  };
}

/** **Les Magasins que la route traverse au départ** : l'arrivée dit ceux qui n'ont rien donné,
 *  capturés ou fermés en route. Un Magasin adverse n'y est jamais : il ne se nomme pas. */
export async function storesCrossed(ctx: MutationCtx, movementId: Id<'movements'>): Promise<void> {
  const movement = await ctx.db.get(movementId);
  if (movement === null) return;
  const stores = passingResupply(
    marchingForce(movement),
    await activeStoresOf(ctx, movement.playerId, movement.departedAt),
    [],
  ).map((take) => take.id);
  if (stores.length > 0) await ctx.db.patch(movementId, { stores });
}

/**
 * **Le Magasin ravitaille la colonne qui le traverse** (ADR 0037 §4), relu à l'arrivée
 * (invariant « Échéance ») : les Magasins agissants de son propriétaire à cette heure, leur dépôt
 * d'alors, la route jusqu'à l'arrivée réelle (`heldAt` d'une colonne retenue à la frontière). Un
 * Magasin capturé ou fermé depuis le départ ne donne rien, et la dépêche le dit.
 */
export async function resupplyInPassing(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const troops = (await Promise.all(movement.troopIds.map((id) => ctx.db.get(id)))).filter(
    (troop): troop is Doc<'troops'> => troop !== null,
  );
  const stores = await activeStoresOf(ctx, movement.playerId, now);
  const takes = passingResupply(
    { ...marchingForce(movement), arrivesAt: movement.heldAt ?? movement.arrivesAt },
    stores,
    troops.map((troop) => ({ ...troop, id: troop._id })),
  );
  const file = async (
    outpost: Doc<'outposts'>,
    outcome: 'served' | 'short' | 'captured' | 'closed',
    steps = { rounds: 0, fuel: 0 },
  ) =>
    ctx.db.insert('notices', {
      playerId: movement.playerId,
      at: now,
      kind: 'storeResupplied',
      hostCountry: outpost.hostCountry,
      point: outpost.point,
      outcome,
      ...steps,
    });
  for (const take of takes) {
    if (take.cost.ammunition + take.cost.oil + take.cost.coal > 0)
      await takeFromDepot(ctx, take.id, take.cost);
    if (take.steps.rounds + take.steps.fuel > 0 || take.short)
      await file((await ctx.db.get(take.id))!, take.short ? 'short' : 'served', take.steps);
  }
  for (const [troopId, refill] of takes.at(-1)?.supplies ?? [])
    await ctx.db.patch(troopId as Id<'troops'>, refill);

  const served = new Set<string>(takes.map((take) => take.id));
  for (const id of movement.stores ?? []) {
    if (served.has(id)) continue;
    const outpost = await ctx.db.get(id);
    /** Démantelé ou détruit, il a déjà sa dépêche. */
    if (outpost === null) continue;
    await file(outpost, outpost.playerId === movement.playerId ? 'closed' : 'captured');
  }
}
