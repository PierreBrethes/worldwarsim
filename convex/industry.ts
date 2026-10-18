import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { playerBuildings, totalLevelOf } from './buildingReads';
import { isCommanded } from './constants';
import { fail } from './errors';
import { maxOrderOf, settle } from './resources';
import { playerOf, requirePlayable } from './seats';
import { BUILDING_KEY } from './validators';
import { refuseInBlitz } from './blitz';

/**
 * **The arsenal is commanded** — the rule and its reason live in
 * `COMMANDED_CHAINS`. What is left here is the two verbs: place a lot, drop it.
 *
 * There is no verb for "finish": a lot ends when `settleStocks` has made the last unit of it,
 * and the row stays at `produced === ordered` so the surface can print what was delivered. A
 * scheduled job would be a second authority on the same figure.
 */
export const order = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), chain: BUILDING_KEY, quantity: v.number() },
  handler: async (ctx, { token, seasonId, chain, quantity }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    if (!isCommanded(chain)) fail('CHAIN_NOT_COMMANDED', { chain });

    const buildings = await playerBuildings(ctx, player._id);
    if (totalLevelOf(buildings, chain) === 0) fail('CHAIN_NOT_STANDING', { building: chain });

    const wanted = Math.floor(quantity);
    // Written as a negation on purpose: NaN is false against every comparison, `wanted <= 0`
    // would let it through.
    if (!(wanted > 0)) fail('EMPTY_ORDER');

    const now = Date.now();
    // Settled and written *before* the row moves: the hours already elapsed belong to the lot
    // that was standing then, not to the one about to replace it.
    const economy = await settle(ctx, player._id, now);

    /** **Une chaîne coupée ne prend pas de lot** (ADR 0020 §6). Le refus se lit sur le règlement
     *  lui-même, jamais sur une seconde lecture de la carte : la vitesse à zéro et le refus
     *  sortent du même verdict, donc l'écran et le serveur ne peuvent pas se contredire. */
    if (economy.chains.some((line) => line.conversion.by === chain && line.state === 'unlinked')) {
      fail('SITE_UNLINKED', { building: chain });
    }

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
  args: { token: v.string(), seasonId: v.id('seasons'), chain: BUILDING_KEY },
  handler: async (ctx, { token, seasonId, chain }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    const now = Date.now();
    const economy = await settle(ctx, player._id, now);
    /** **On abandonne un lot coupé, on n'en prend pas.** Refuser ici enfermerait le joueur : la
     *  chaîne ne rendra rien tant que la région n'est pas reprise, et le lot lui interdit d'en
     *  poser un autre le jour où elle l'est. */
    const standing = economy.orders.find((lot) => lot.chain === chain) ?? null;
    if (standing === null) fail('NO_ORDER', { chain });

    await ctx.db.delete(standing.row._id);
    return { delivered: Math.floor(standing.produced), ordered: standing.ordered };
  },
});
