import { v } from 'convex/values';
import { query } from './_generated/server';
import { playerOf } from './seats';
import { facedOf, kindsOf, tallyOf } from './view';
import type { ReplayView } from '../src/domain/player-view';

/**
 * **Le rejeu d'un engagement, demandé quand on le lance et jamais servi avec la vue** (ADR 0026
 * §7). Seul un camp le relit : le sien par rôle et marque, et **ce qu'il a eu en face** par
 * rôle, marque et nation (F1, `facedOf`) — on a vu l'ennemi au feu. Un engagement d'avant le
 * 14/10 ne porte pas la nation : l'autre camp n'y sort qu'en totaux, comme avant.
 *
 * Le détail se lit sur `engagements.troops`, que tout engagement porte depuis le premier : aucun
 * engagement ancien n'en est privé.
 */
export const replayOf = query({
  args: { token: v.string(), seasonId: v.id('seasons'), combatId: v.string() },
  handler: async (
    ctx,
    { token, seasonId, combatId },
  ): Promise<ReplayView | { refusal: 'UNKNOWN_COMBAT' | 'NOT_A_PARTY' }> => {
    const { player } = await playerOf(ctx, token, seasonId);
    const id = ctx.db.normalizeId('engagements', combatId);
    const engagement = id === null ? null : await ctx.db.get(id);
    if (!engagement) return { refusal: 'UNKNOWN_COMBAT' };
    const side =
      engagement.attackerId === player._id
        ? ('attacker' as const)
        : engagement.defenderId === player._id
          ? ('defender' as const)
          : null;
    if (side === null) return { refusal: 'NOT_A_PARTY' };

    return {
      combatId: engagement._id,
      at: engagement.at,
      point: engagement.point,
      side,
      won: engagement.winner === side,
      mine: kindsOf(engagement.troops.filter((troop) => troop.side === side)),
      theirs: tallyOf(engagement.troops.filter((troop) => troop.side !== side)),
      ...facedOf(engagement, side),
      ...(engagement.cause === 'bombardment'
        ? {
            bombardment:
              side === 'attacker' && engagement.firedFrom !== undefined
                ? { from: engagement.firedFrom }
                : {},
          }
        : {}),
    };
  },
});
