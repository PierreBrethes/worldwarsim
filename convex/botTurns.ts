import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { submitBotOrder } from './botOrders';
import { decideTurn, worldFrom, type BotWorld, type BotWorldFiles } from '../src/domain/bot';
import { playerViewOf } from '../src/domain/server-view';
import projection from '../public/projection.json';
import grid from '../public/grid.json';
import coast from '../public/coast.json';
import regionGrid from '../public/region-grid.json';
import regionIndex from '../public/region-index.json';

/**
 * **Le serveur joue ses bots par la porte d'un joueur** (ADR 0042 §1, révisée le 26/11, #704).
 * Ce module ne fait que ça, seul, parce qu'il porte le monde du décideur (grille, côte, raster
 * des régions) : aucune mutation du jeu ne paie son import. Le bot lit sa vue et son atelier
 * avec son jeton, décide par `decideTurn`, et pose chaque ordre par sa mutation publique
 * (`submitBotOrder`). Jamais d'`internal*` pour jouer : la seule lecture interne est son siège.
 */

let world: BotWorld | null = null;
/** Décodé à la première passe de l'isolat, jamais à l'import (CONVENTIONS §3). */
const botWorld = (): BotWorld =>
  (world ??= worldFrom({
    projection,
    grid,
    coast,
    regionGrid,
    regionIndex,
  } as unknown as BotWorldFiles));

/** **Un passage d'un bot.** Un ordre refusé est oublié, comme dans le pilote Node (ADR 0042 §3). */
export const turn = internalAction({
  args: { botId: v.id('bots') },
  handler: async (ctx, { botId }): Promise<null> => {
    const seat = await ctx.runQuery(internal.bots.seatOfBot, { botId });
    if (seat === null) return null;
    let view;
    let workshop;
    try {
      view = playerViewOf(await ctx.runQuery(api.view.playerView, seat));
      workshop = await ctx.runQuery(api.troops.workshop, seat);
    } catch (error) {
      console.log(`bot ${botId}: view refused (${String(error)})`);
      return null;
    }
    const orders = decideTurn({ view, workshop, world: botWorld(), now: Date.now() });
    for (const order of orders) {
      try {
        await submitBotOrder(
          (mutation, args) => ctx.runMutation(mutation, args as never),
          seat,
          order,
        );
      } catch (error) {
        console.log(`bot ${botId}: ${order.fn} refused (${String(error)})`);
      }
    }
    return null;
  },
});
