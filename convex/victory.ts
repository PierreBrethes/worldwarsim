import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { isReduced, playersToReduce } from '../src/domain/victory';
import { REDUCTION_FACTOR } from './constants';
import { concludeSeason } from './seasons';
import { belligerentOf, isAtWar, seatsOf } from './seats';

/**
 * **The wiring of the test victory.** The rule itself is in `src/domain/victory.ts` — pure and
 * testable without a database — and its header says the important part: this whole thing is
 * scaffolding for the first real skirmish, to be **replaced** by the share of the map (ADR
 * 0020) rather than amended.
 *
 * Nothing here is stored except what happened: the capacity is read off the troops every time it
 * is asked for, and the tally is read off the engagements. A season carries a winner and an hour
 * because those are events; it carries no counter, because a counter is a second truth.
 */

export type Standing = {
  readonly player: Doc<'players'>;
  readonly isReduced: boolean;
  /** How many distinct players he holds under the bar **right now**. */
  readonly reduced: number;
};

/**
 * Everything a player has standing: the troops rows, and only those. A column walking home from
 * a defeat is in there — it is routed, not lost, and it comes back (rule 3 of the project) — and
 * a batch in a recruitment queue is not, because it is not a troop yet.
 */
async function forceOf(ctx: QueryCtx, playerId: Id<'players'>): Promise<Array<Doc<'troops'>>> {
  return ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

export async function isPlayerReduced(ctx: QueryCtx, playerId: Id<'players'>): Promise<boolean> {
  const force = await forceOf(ctx, playerId);
  return isReduced(
    force.map((troop) => ({
      strength: troop.currentStrength,
      nominalStrength: troop.nominalStrength,
    })),
    REDUCTION_FACTOR,
  );
}

/**
 * Who a reduced player owes his state to: the attacker of the **last** engagement that pushed
 * him under. The last one rather than any one, so a player knocked down twice by two different
 * hands counts for the second — otherwise one blow landed on Tuesday would keep paying for the
 * rest of the season, and two players would hold the same scalp at once.
 */
async function executionerOf(
  ctx: QueryCtx,
  defenderId: Id<'players'>,
): Promise<Id<'players'> | null> {
  const blow = await ctx.db
    .query('engagements')
    .withIndex('byDefenderReduced', (q) =>
      q.eq('defenderId', defenderId).eq('reducedDefender', true),
    )
    .order('desc')
    .first();
  return blow?.attackerId ?? null;
}

/**
 * **The board of the season, public and named.** There is one condition and everybody plays
 * it (ADR 0020 §9), so nothing is left to keep secret and a test between friends wants the
 * ribbing. It is also the reason this leaks nothing the fog cares about — a capacity is not a
 * position, a composition or a heading.
 *
 * Read at the instant, always: a player who rebuilds over the bar leaves the count of the man
 * who put him under it.
 */
export async function standingsOf(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<Standing>> {
  const season = await ctx.db.get(seasonId);
  const seats = await seatsOf(ctx, seasonId);
  /**
   * **The belligerents, and `n` is their number** — counted at the instant, like everything else
   * here. A seat taken on a running season by somebody still choosing his flag is not a nation
   * to reduce: he holds no troop, so the bar would count him as already down, and he would raise
   * the threshold of every player in the field without ever having been in it. He joins the
   * count the hour he enters the war (`seasons.enterWar`), and the target moves then.
   */
  const players = season === null ? seats : seats.filter((seat) => isAtWar(seat, season));

  const fallen = new Set<string>();
  for (const player of players) {
    if (await isPlayerReduced(ctx, player._id)) fallen.add(player._id);
  }

  const held = new Map<string, number>();
  for (const player of players) {
    if (!fallen.has(player._id)) continue;
    const by = await executionerOf(ctx, player._id);
    if (by === null || by === player._id) continue;
    held.set(by, (held.get(by) ?? 0) + 1);
  }

  return players.map((player) => ({
    player,
    isReduced: fallen.has(player._id),
    reduced: held.get(player._id) ?? 0,
  }));
}

export const reductionTarget = (players: number): number => playersToReduce(players);

/**
 * **Le tableau, dans une query à part et jamais dans `playerView`.** Il lit les troupes de chaque
 * belligérant : cousu à la vue, la moindre troupe patchée chez n'importe qui relançait la vue de
 * tout le monde (`technique/brouillard-et-fanout.md`). Seul ce petit tableau se relance
 * maintenant, et il part entier avec la Domination simplifiée.
 */
export const board = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await belligerentOf(ctx, token, seasonId);
    const standings = await standingsOf(ctx, season._id);
    return {
      target: reductionTarget(standings.length),
      standings: standings.map((standing) => ({
        nation: standing.player.nation,
        nickname: standing.player.nickname,
        isMine: standing.player._id === player._id,
        isReduced: standing.isReduced,
        reduced: standing.reduced,
      })),
    };
  },
});

/**
 * **The claim, made by the attacker of the pass that just crossed the threshold** — and by
 * nobody else, which is what the condition says out loud. It runs once per engagement, from the
 * resolution itself (`combat.ts`), so a player who reaches the target by watching an opponent
 * disband his own army does not win by attrition of somebody else's patience.
 */
export async function claimVictory(
  ctx: MutationCtx,
  season: Doc<'seasons'>,
  attackerId: Id<'players'>,
  at: number,
): Promise<void> {
  if (season.status !== 'launched') return;

  const standings = await standingsOf(ctx, season._id);
  const claimant = standings.find((standing) => standing.player._id === attackerId);
  if (!claimant || claimant.reduced < reductionTarget(standings.length)) return;

  await concludeSeason(ctx, season._id, attackerId, at);
}
