import { v } from 'convex/values';
import { query } from './_generated/server';
import { playerOf } from './seats';
import { tallyOf } from './view';
import type { ReplayView } from '../src/domain/player-view';

/**
 * **Le rejeu d'un engagement, demandé quand on le lance et jamais servi avec la vue** (ADR 0026
 * §7). Seul un camp le relit, et il n'y lit que **le sien** par rôle et marque : la ligne de
 * l'engagement garde chaque troupe des deux camps, les frappes leurs rôles, et l'autre camp ne
 * sort qu'en totaux, ceux du compte rendu — le brouillard ne se lève pas parce qu'on a tiré
 * (ADR 0005).
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

    const mine = engagement.troops.filter((troop) => troop.side === side);
    const kinds = [...new Set(mine.map((troop) => `${troop.role}:${troop.tier}`))].sort();
    return {
      combatId: engagement._id,
      at: engagement.at,
      point: engagement.point,
      side,
      won: engagement.winner === side,
      mine: kinds.map((kind) => {
        const rows = mine.filter((troop) => `${troop.role}:${troop.tier}` === kind);
        return { role: rows[0]!.role, tier: rows[0]!.tier, ...tallyOf(rows) };
      }),
      theirs: tallyOf(engagement.troops.filter((troop) => troop.side !== side)),
    };
  },
});
