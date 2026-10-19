import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import {
  researchMs,
  researchRefusalOf,
  researchUnqueueRefusalOf,
  searcherLevel,
} from '../src/domain/research';
import type { ResearchCard } from '../src/domain/ids';
import { RESEARCH_SPEC } from './constants';
import { refuseInBlitz } from './blitz';
import { playerBuildings } from './buildingReads';
import { fail } from './errors';
import { credit, debit, economyOf } from './resources';
import { playerOf, requirePlayable, seasonStillPlays } from './seats';
import { RESEARCH_CARD } from './validators';

/** Le niveau du Centre de recherche du joueur, tel que `searcherLevel` le lit. */
const centerLevelOf = async (ctx: MutationCtx, playerId: Id<'players'>) =>
  searcherLevel(
    (await playerBuildings(ctx, playerId)).map((building) => ({
      key: building.key,
      level: building.level,
      captured: building.capturedAt !== undefined,
    })),
  );

/** La carte suivante prend le Centre : sa durée se fixe ici, au niveau du Centre de ce moment. */
async function runCard(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  card: ResearchCard,
  now: number,
): Promise<number> {
  const level = await centerLevelOf(ctx, playerId);
  const remainingMs = researchMs(card, level ?? 1);
  const standing = level !== null;
  await ctx.db.patch(playerId, {
    research: { card, totalMs: remainingMs, remainingMs, since: standing ? now : null },
  });
  if (standing)
    await ctx.scheduler.runAt(now + remainingMs, internal.research.finish, {
      playerId,
      finishesAt: now + remainingMs,
    });
  return now + remainingMs;
}

/**
 * **Poser une carte sur son Centre de recherche** (ADR 0028 §5, #123, #165) : payée à la pose, elle
 * court en heures de jeu, raccourcies au niveau du Centre (ADR 0031), et débloque à la fin. Trois
 * cartes au plus : la première court, les autres attendent leur tour. Le refus est celui que la
 * fenêtre de l'arbre dit avant le geste (`researchRefusalOf`).
 */
export const start = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), card: RESEARCH_CARD },
  handler: async (ctx, { token, seasonId, card }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    const now = Date.now();
    const { stocks } = await economyOf(ctx, player._id, now);
    const centerLevel = await centerLevelOf(ctx, player._id);
    const queued = player.researchQueue ?? [];
    const refusal = researchRefusalOf(card, {
      researched: player.researched ?? [],
      running: player.research?.card ?? null,
      queued,
      centerLevel,
      stocks,
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    await debit(ctx, player._id, RESEARCH_SPEC[card].cost, now);
    if (player.research !== undefined) {
      await ctx.db.patch(player._id, { researchQueue: [...queued, card] });
      return { finishesAt: null };
    }
    return { finishesAt: await runCard(ctx, player._id, card, now) };
  },
});

/** **Retirer une carte qui attend** : remboursée en entier, la file se resserre. */
export const dequeue = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), card: RESEARCH_CARD },
  handler: async (ctx, { token, seasonId, card }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    const queued = player.researchQueue ?? [];
    const refusal = researchUnqueueRefusalOf(card, {
      running: player.research?.card ?? null,
      queued,
    });
    if (refusal !== null) {
      const { code, ...details } = refusal;
      fail(code, details);
    }
    await credit(ctx, player._id, RESEARCH_SPEC[card].cost, Date.now());
    await ctx.db.patch(player._id, { researchQueue: queued.filter((other) => other !== card) });
  },
});

/** La carte aboutit, si elle court encore vers cette heure-là : une pause l'a redatée. La
 *  première de la file prend alors le Centre. */
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
    const [next, ...rest] = player.researchQueue ?? [];
    await ctx.db.patch(playerId, {
      researched: [...(player.researched ?? []), running.card],
      research: undefined,
      researchQueue: rest,
    });
    await ctx.db.insert('notices', {
      playerId,
      at: finishesAt,
      kind: 'researchDone',
      card: running.card,
    });
    if (next !== undefined) await runCard(ctx, playerId, next, finishesAt);
  },
});

/**
 * **La carte suit son Centre de recherche** (#123) : sans Centre à soi — rasé, pris, jamais bâti —
 * elle s'arrête, et ce qu'elle a couru reste couru ; un Centre de nouveau debout la relance.
 * Appelée partout où un Centre paraît ou disparaît.
 */
export async function followCenter(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<void> {
  const running = (await ctx.db.get(playerId))?.research;
  if (running === undefined) return;
  const standing = (await centerLevelOf(ctx, playerId)) !== null;
  if (!standing && running.since !== null) {
    await ctx.db.patch(playerId, {
      research: {
        ...running,
        remainingMs: Math.max(0, running.remainingMs - (now - running.since)),
        since: null,
      },
    });
  } else if (standing && running.since === null) {
    await ctx.db.patch(playerId, { research: { ...running, since: now } });
    await ctx.scheduler.runAt(now + running.remainingMs, internal.research.finish, {
      playerId,
      finishesAt: now + running.remainingMs,
    });
  }
}
