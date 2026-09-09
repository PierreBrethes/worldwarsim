import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { resolveEngagement, type Combatant, type Engagement } from '../src/domain/combat';
import { COMBAT_RULES } from './constants';
import { REPORTS_SERVED } from '../src/domain/player-view';
import { debit, economyOf } from './resources';
import { claimVictory, isPlayerReduced } from './victory';
import {
  combatCargoSnapshot,
  recoverDestroyedCombatCargo,
  settleCombatCargo,
  type HomewardCargo,
} from './cargo';

/**
 * **The pass of resolution, as the board records it.** The rules themselves are in
 * `src/domain/combat.ts` — pure, deterministic, testable without a database. This module is
 * only the wiring: who is standing where, what the account says afterwards.
 *
 * Nothing here decides *whether* two forces meet. That is `movements.ts`, at an arrival or at
 * an interception.
 */

export type Engaged = {
  readonly playerId: Id<'players'>;
  readonly troops: ReadonlyArray<Doc<'troops'>>;
};

export type Resolution = {
  readonly engagementId: Id<'engagements'>;
  readonly engagement: Engagement;
  /** The troops that broke contact, by side — each one owes a march home. */
  readonly routed: ReadonlyArray<Doc<'troops'>>;
  readonly routedCargo: ReadonlyArray<HomewardCargo>;
};

/**
 * A troop's hit points **are** its strength (ADR 0014), so the account is written in the same
 * unit the screen reads: 32 of 50 soldiers left.
 */
const combatantOf = (troop: Doc<'troops'>): Combatant => ({
  id: troop._id,
  role: troop.role,
  tier: troop.tier,
  strength: troop.currentStrength,
  nominalStrength: troop.nominalStrength,
  formedAt: troop._creationTime,
});

export async function resolveContact(
  ctx: MutationCtx,
  {
    seasonId,
    attacker,
    defender,
    cause,
    point,
    hostCountry,
    outpostId,
    disabledUntil,
    at,
  }: {
    seasonId: Id<'seasons'>;
    attacker: Engaged;
    defender: Engaged;
    cause: 'arrival' | 'interception';
    point: { lon: number; lat: number };
    hostCountry: string;
    outpostId: Id<'outposts'> | null;
    disabledUntil: number | null;
    at: number;
  },
): Promise<Resolution> {
  /**
   * **The magazine is read before the pass and paid after it** (question 18, settled 25/08).
   * Ammunition is billed here and nowhere else — a troop costs nothing in rounds to raise, it
   * costs rounds every time it fires — so this is the only place a stock and a strike meet.
   *
   * The debit cannot refuse: `resolveEngagement` has already clamped it to what the nation
   * holds, and a camp that could not pay has already fired at `DRY_AMMUNITION_FACTOR`. An
   * engagement is never declined for want of matter.
   */
  const engagement = resolveEngagement({
    attackers: attacker.troops.map(combatantOf),
    defenders: defender.troops.map(combatantOf),
    ammunition: {
      attacker: (await economyOf(ctx, attacker.playerId, at)).stocks.ammunition,
      defender: (await economyOf(ctx, defender.playerId, at)).stocks.ammunition,
    },
    rules: COMBAT_RULES,
  });

  for (const side of ['attacker', 'defender'] as const) {
    const { spent, dry } = engagement.magazine[side];
    const who = side === 'attacker' ? attacker.playerId : defender.playerId;
    if (spent > 0) await debit(ctx, who, { ammunition: spent }, at);
    /**
     * **A side that could not pay struck at `DRY_AMMUNITION_FACTOR`**, and nothing else on the
     * board says it: the account of the pass shows losses, never the reason for them, so a
     * supply fault reads as a defeat. Dryness belongs to the side and not to a troop (design
     * sheet 09), so it is one line for the whole pass.
     */
    if (dry) {
      await ctx.db.insert('notices', {
        playerId: who,
        at,
        kind: 'firedDry',
        hostCountry,
      });
    }
  }

  /** Read **before** the outcomes land: "this pass is the one that crossed the bar" needs the
   *  state it crossed from, and one line later nothing on the board remembers it. */
  const wasReduced = await isPlayerReduced(ctx, defender.playerId);

  const byId = new Map<string, Doc<'troops'>>(
    [...attacker.troops, ...defender.troops].map((troop) => [troop._id, troop]),
  );
  const routed: Array<Doc<'troops'>> = [];
  const cargoBefore = await combatCargoSnapshot(ctx, seasonId, new Set(byId.keys()));

  for (const outcome of engagement.outcomes) {
    const troop = byId.get(outcome.id);
    if (!troop) continue;
    if (outcome.state === 'destroyed') await ctx.db.delete(troop._id);
    else {
      await ctx.db.patch(troop._id, { currentStrength: outcome.strengthAfter });
      if (outcome.state === 'routed') routed.push(troop);
    }
  }

  const reducedDefender = !wasReduced && (await isPlayerReduced(ctx, defender.playerId));

  const engagementId = await ctx.db.insert('engagements', {
    seasonId,
    attackerId: attacker.playerId,
    defenderId: defender.playerId,
    cause,
    point,
    hostCountry,
    at,
    winner: engagement.winner,
    outpostId,
    disabledUntil,
    reducedDefender,
    troops: engagement.outcomes.map((outcome) => {
      const troop = byId.get(outcome.id)!;
      return {
        troopId: troop._id,
        side: outcome.side,
        role: troop.role,
        tier: troop.tier,
        strengthBefore: outcome.strengthBefore,
        strengthAfter: outcome.strengthAfter,
        state: outcome.state,
      };
    }),
  });

  const recoveringPlayerId =
    engagement.winner === 'attacker' ? attacker.playerId : defender.playerId;
  const dispossessedPlayerId =
    engagement.winner === 'attacker' ? defender.playerId : attacker.playerId;
  const cargoSettlement = await settleCombatCargo(
    ctx,
    cargoBefore,
    engagement.outcomes,
    dispossessedPlayerId,
    at,
  );
  await recoverDestroyedCombatCargo(ctx, {
    seasonId,
    engagementId,
    destroyed: cargoSettlement.destroyed,
    recoveringPlayerId,
    standingTroopIds: engagement.outcomes
      .filter((outcome) => outcome.side === engagement.winner && outcome.state === 'standing')
      .map((outcome) => outcome.id),
    point,
    at,
  });
  const routedCargo = cargoSettlement.homeward;

  /**
   * **The blow-by-blow hangs from the account, it is not part of it.** The report is read on
   * every load of the board to show two totals; the detail is read by nothing yet and by the
   * visual replay one day (surface 4.7), one engagement at a time. Kept inside the document it
   * made a season of passes unreadable in a single query.
   */
  let rank = 0;
  for (const strike of engagement.strikes) {
    const by = byId.get(strike.by)!;
    const target = byId.get(strike.target)!;
    await ctx.db.insert('strikes', {
      engagementId,
      rank,
      phase: strike.phase,
      by: by._id,
      byRole: by.role,
      byTier: by.tier,
      bySide: attacker.troops.some((troop) => troop._id === by._id)
        ? ('attacker' as const)
        : ('defender' as const),
      target: target._id,
      targetRole: target.role,
      targetTier: target.tier,
      losses: strike.losses,
    });
    rank += 1;
  }

  /**
   * The season is claimed here and only here, because this is the one place an engagement is
   * written: the condition of the test victory is "be the attacker of the pass that crosses the
   * threshold" (`convex/victory.ts`), and there is no other moment at which that is true.
   *
   * **The attacker of a camp's pass is the camp, and that counts** (ADR 0019 §3, ratified
   * 18/08). A player therefore advances his victory during a pass he ordered nothing in — which
   * is a decision, not an oversight: posting the camp *was* the order. It cost a slot, one troop
   * out of twenty-four and, once the upkeep lands, a raised one. An investment that pays nothing
   * when its bet comes off is not an investment; this is the yield of the intelligence, not a
   * win in one's sleep.
   */
  const season = await ctx.db.get(seasonId);
  if (season) await claimVictory(ctx, season, attacker.playerId, at);

  return { engagementId, engagement, routed, routedCargo };
}

/**
 * **The last passes of a player, both sides of the field, and nothing older.** The window is the
 * journal's (`REPORTS_SERVED`) and it is a screen bound, not a rule: a season with three hundred
 * accounts in it read them all to show the last twenty, and the view grew with the season until
 * it went through Convex's read ceiling.
 *
 * Two indexes, so the depth is taken **on each** before the merge: an attacker who was never
 * attacked would otherwise serve half a window.
 */
export async function engagementsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'engagements'>>> {
  const mine = await ctx.db
    .query('engagements')
    .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
    .order('desc')
    .take(REPORTS_SERVED);
  const against = await ctx.db
    .query('engagements')
    .withIndex('byDefender', (q) => q.eq('defenderId', playerId))
    .order('desc')
    .take(REPORTS_SERVED);
  return [...mine, ...against].sort((a, b) => b.at - a.at).slice(0, REPORTS_SERVED);
}

/** Every troop hanging from a point or a building, whoever it belongs to. */
export async function troopsStationedAt(
  ctx: QueryCtx,
  stationId: Id<'buildings'> | Id<'outposts'>,
): Promise<Array<Doc<'troops'>>> {
  return ctx.db
    .query('troops')
    .withIndex('byStation', (q) => q.eq('stationedAt', stationId))
    .collect();
}
