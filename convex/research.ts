import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { researchMs, researchRefusalOf } from '../src/domain/research';
import { RESEARCH_SPEC } from './constants';
import { refuseInBlitz } from './blitz';
import { playerBuildings } from './buildingReads';
import { fail } from './errors';
import { debit, economyOf } from './resources';
import { playerOf, requirePlayable, seasonStillPlays } from './seats';
import { RESEARCH_CARD } from './validators';

/** **Un QG à soi, debout** : un QG pris à un autre ne cherche pas pour son preneur. */
export const holdsHq = (buildings: ReadonlyArray<Doc<'buildings'>>): boolean =>
  buildings.some(
    (building) => building.key === 'hq' && building.capturedAt === undefined && building.level > 0,
  );

/**
 * **Poser une carte sur son QG** (ADR 0028 §5) : payée à la pose, elle court en heures de jeu
 * et débloque à la fin. Une seule à la fois ; le refus est celui que la carte dit au survol du
 * QG (`researchRefusalOf`).
 */
export const start = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), card: RESEARCH_CARD },
  handler: async (ctx, { token, seasonId, card }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    const now = Date.now();
    const { stocks } = await economyOf(ctx, player._id, now);
    const refusal = researchRefusalOf(card, {
      researched: player.researched ?? [],
      running: player.research?.card ?? null,
      hqHeld: holdsHq(await playerBuildings(ctx, player._id)),
      stocks,
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    await debit(ctx, player._id, RESEARCH_SPEC[card].cost, now);
    const remainingMs = researchMs(card);
    await ctx.db.patch(player._id, { research: { card, remainingMs, since: now } });
    await ctx.scheduler.runAt(now + remainingMs, internal.research.finish, {
      playerId: player._id,
      finishesAt: now + remainingMs,
    });
    return { finishesAt: now + remainingMs };
  },
});

/** La carte aboutit, si elle court encore vers cette heure-là : une pause l'a redatée. */
export const finish = internalMutation({
  args: { playerId: v.id('players'), finishesAt: v.number() },
  handler: async (ctx, { playerId, finishesAt }) => {
    const player = await ctx.db.get(playerId);
    const running = player?.research;
    if (
      player === null ||
      running === undefined ||
      running.since === null ||
      running.since + running.remainingMs !== finishesAt ||
      !(await seasonStillPlays(ctx, playerId))
    )
      return;
    await ctx.db.patch(playerId, {
      researched: [...(player.researched ?? []), running.card],
      research: undefined,
    });
    await ctx.db.insert('notices', {
      playerId,
      at: finishesAt,
      kind: 'researchDone',
      card: running.card,
    });
  },
});

/** **Un QG qui tombe arrête la carte** : ce qu'elle a couru reste couru. */
export async function pauseResearch(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<void> {
  const running = (await ctx.db.get(playerId))?.research;
  if (running === undefined || running.since === null) return;
  await ctx.db.patch(playerId, {
    research: {
      ...running,
      remainingMs: Math.max(0, running.remainingMs - (now - running.since)),
      since: null,
    },
  });
}

/** **Un QG de nouveau debout** relance la carte qui l'attendait. */
export async function resumeResearch(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<void> {
  const running = (await ctx.db.get(playerId))?.research;
  if (running === undefined || running.since !== null) return;
  await ctx.db.patch(playerId, { research: { ...running, since: now } });
  await ctx.scheduler.runAt(now + running.remainingMs, internal.research.finish, {
    playerId,
    finishesAt: now + running.remainingMs,
  });
}
