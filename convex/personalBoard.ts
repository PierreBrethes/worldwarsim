import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { stampReadMark } from './readMarks';
import { economyOf } from './resources';
import { playerOf, requireStarted } from './seats';

/**
 * **Le plateau personnel a été ouvert** : l'heure et les stocks réglés à cette heure, ceux du
 * serveur et non ceux que l'écran extrapole. La récolte de la visite suivante est l'écart entre
 * eux et ceux de l'heure, sans journal des flux : ce qui est entré moins ce qui est sorti, par
 * ressource.
 *
 * `requireStarted` et non `requirePlayable` : ouvrir son plateau personnel est lire, pas jouer.
 */
export const markRead = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireStarted(season);
    const now = Date.now();
    const { stocks } = await economyOf(ctx, player._id, now);
    await stampReadMark(ctx, player._id, {
      boardReadAt: now,
      boardReadStocks: Object.fromEntries(
        Object.entries(stocks).map(([key, stock]) => [key, Math.floor(stock)]),
      ),
    });
  },
});
