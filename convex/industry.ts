import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { playerBuildings, totalLevelOf } from './buildings';
import { isCommanded } from './constants';
import { fail } from './errors';
import { maxOrderOf, settle } from './resources';
import { playerByToken, requirePlayable } from './seasons';
import { BUILDING_KEY } from './validators';

/**
 * **The arsenal is commanded, the foundry is not** — the rule and its reason live in
 * `COMMANDED_CHAINS`. What is left here is the two verbs: place a lot, drop it.
 *
 * There is no verb for "finish": a lot ends when `settleStocks` has made the last unit of it,
 * and the row stays at `produced === ordered` so the surface can print what was delivered. A
 * scheduled job would be a second authority on the same figure.
 */
export const order = mutation({
  args: { token: v.string(), chain: BUILDING_KEY, quantity: v.number() },
  handler: async (ctx, { token, chain, quantity }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);
    if (!isCommanded(chain)) fail('CHAIN_NOT_COMMANDED', { chain });

    const buildings = await playerBuildings(ctx, player._id);
    if (totalLevelOf(buildings, chain) === 0) fail('CHAIN_NOT_STANDING', { building: chain });

    const wanted = Math.floor(quantity);
    if (wanted <= 0) fail('EMPTY_ORDER');

    const now = Date.now();
    // Settled and written *before* the row moves: the hours already elapsed belong to the lot
    // that was standing then, not to the one about to replace it.
    const economy = await settle(ctx, player._id, now);

    const standing = economy.orders.find((lot) => lot.chain === chain) ?? null;
    if (standing !== null && standing.produced < standing.ordered) {
      fail('ORDER_RUNNING', { ordered: standing.ordered, produced: Math.floor(standing.produced) });
    }

    const maximum = maxOrderOf(economy, chain);
    if (wanted > maximum) fail('ORDER_ABOVE_RESERVE', { maximum });

    if (standing !== null) await ctx.db.delete(standing.row._id);
    await ctx.db.insert('orders', {
      playerId: player._id,
      chain,
      ordered: wanted,
      produced: 0,
      placedAt: now,
    });
    return { ordered: wanted };
  },
});

/**
 * Dropping a lot returns nothing, because nothing was taken: the matter is eaten hour by hour
 * as the line runs, so what has not been converted was never off the player's books. It is the
 * refund rule of the recruitment queue arriving at the same place by a shorter road — what has
 * not started costs nothing.
 */
export const cancelOrder = mutation({
  args: { token: v.string(), chain: BUILDING_KEY },
  handler: async (ctx, { token, chain }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    const now = Date.now();
    const economy = await settle(ctx, player._id, now);
    const standing = economy.orders.find((lot) => lot.chain === chain) ?? null;
    if (standing === null) fail('NO_ORDER', { chain });

    await ctx.db.delete(standing.row._id);
    return { delivered: Math.floor(standing.produced), ordered: standing.ordered };
  },
});
