import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { LonLat } from '../src/domain/geo';
import { resolveEngagement, type Combatant, type Engagement } from '../src/domain/combat';
import { COMBAT_RULES } from './constants';
import { economyOf, debit } from './resources';
import { claimVictory, isPlayerReduced } from './victory';

/**
 * **The pass of resolution, as the board records it.** The rules themselves are in
 * `src/domain/combat.ts` — pure, deterministic, testable without a database. This module is
 * only the wiring: who is standing where, what the reserve can arm, what the account says
 * afterwards.
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
  const engagement = resolveEngagement({
    attackers: attacker.troops.map(combatantOf),
    defenders: defender.troops.map(combatantOf),
    rules: COMBAT_RULES,
    rounds: {
      attacker: await roundsAvailable(ctx, attacker.playerId, at),
      defender: await roundsAvailable(ctx, defender.playerId, at),
    },
  });

  await spendRounds(ctx, attacker.playerId, engagement.roundsSpent.attacker, at);
  await spendRounds(ctx, defender.playerId, engagement.roundsSpent.defender, at);

  /** Read **before** the outcomes land: "this pass is the one that crossed the bar" needs the
   *  state it crossed from, and one line later nothing on the board remembers it. */
  const wasReduced = await isPlayerReduced(ctx, defender.playerId);

  const byId = new Map<string, Doc<'troops'>>(
    [...attacker.troops, ...defender.troops].map((troop) => [troop._id, troop]),
  );
  const routed: Array<Doc<'troops'>> = [];

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
    strikes: engagement.strikes.map((strike) => {
      const by = byId.get(strike.by)!;
      const target = byId.get(strike.target)!;
      return {
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
        dry: strike.dry,
      };
    }),
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

  /**
   * The season is claimed here and only here, because this is the one place an engagement is
   * written: the condition of the test victory is "be the attacker of the pass that crosses the
   * threshold" (`convex/victory.ts`), and there is no other moment at which that is true.
   */
  const season = await ctx.db.get(seasonId);
  if (season) await claimVictory(ctx, season, attacker.playerId, at);

  return { engagementId, engagement, routed };
}

export async function engagementsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'engagements'>>> {
  const mine = await ctx.db
    .query('engagements')
    .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
    .collect();
  const against = await ctx.db
    .query('engagements')
    .withIndex('byDefender', (q) => q.eq('defenderId', playerId))
    .collect();
  return [...mine, ...against].sort((a, b) => b.at - a.at);
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

export const pointOf = (lonLat: LonLat) => ({ lon: lonLat[0], lat: lonLat[1] });

/**
 * The reserve is national and the rounds come out of it: a column marching on a country that
 * has run dry fights dry, whatever it left the barracks carrying. Modelling a magazine per
 * troop would take a field nobody has asked for and a resupply rule that does not exist.
 */
async function roundsAvailable(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  at: number,
): Promise<number> {
  const economy = await economyOf(ctx, playerId, at);
  return Math.floor(economy.stocks.ammunition);
}

async function spendRounds(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  rounds: number,
  at: number,
): Promise<void> {
  if (rounds > 0) await debit(ctx, playerId, { ammunition: rounds }, at);
}
