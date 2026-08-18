import type { UnitRole, UnitTier } from './ids';
import { ROLE_ORDER, TIERS_BY_ROLE } from './troops';

/**
 * **One engagement is one resolution pass** (ADR 0014, design sheet 08). The attacker strikes,
 * the defender ripostes with its survivors, and it is over. Three passes turn fourteen of the
 * seventy-five reachable couples into total annihilations — measured, not supposed.
 *
 * Deterministic, without a die: in an asynchronous game nobody is there to react to a roll.
 *
 * The numbers are **not** here. They live in `convex/constants.ts` with every other balance
 * figure and travel in as `CombatRules`, exactly as a conversion travels into the economy. This
 * module owns the anatomy of the pass, never a value of it.
 */

/**
 * What the damage table is indexed by: a role, or a role **and** its tier where the two marks
 * are different weapons. Mark-2 infantry answers a tank (.65) where mark 1 scratches it (.15);
 * one line per role would make that distinction unsayable.
 */
export const COMBAT_PROFILES = [
  'infantry1',
  'infantry2',
  'armor1',
  'armor2',
  'landTransport',
  'fighter',
  'bomber',
  'airTransport',
  'escort',
  'cargo',
  'carrier',
] as const;

export type CombatProfile = (typeof COMBAT_PROFILES)[number];

export const profileOf = (role: UnitRole, tier: UnitTier): CombatProfile =>
  (TIERS_BY_ROLE[role] === 2 ? `${role}${tier}` : role) as CombatProfile;

/**
 * The share of the defender's **nominal** strength a full-strength attacker destroys in one
 * pass, before modifiers. An absent cell means "cannot reach" — forty-six of the hundred and
 * twenty-one — and a missing cell is never a zero: a bomber unreachable by a tank is not a
 * bomber a tank hits for nothing.
 */
export type DamageTable = Readonly<
  Record<CombatProfile, Readonly<Partial<Record<CombatProfile, number>>>>
>;

export type CombatRules = {
  readonly damage: DamageTable;
  readonly defenderBonus: number;
  readonly routThreshold: number;
};

export type Combatant = {
  readonly id: string;
  readonly role: UnitRole;
  readonly tier: UnitTier;
  readonly strength: number;
  readonly nominalStrength: number;
  /** Breaks a tie between two troops of the same role: the older one fires first. */
  readonly formedAt: number;
};

export type CombatSide = 'attacker' | 'defender';

export type TroopState = 'standing' | 'routed' | 'destroyed';

export type Strike = {
  readonly phase: 'strike' | 'riposte';
  readonly by: string;
  readonly target: string;
  readonly losses: number;
};

export type CombatantOutcome = {
  readonly id: string;
  readonly side: CombatSide;
  readonly strengthBefore: number;
  readonly strengthAfter: number;
  readonly state: TroopState;
};

export type Engagement = {
  readonly strikes: ReadonlyArray<Strike>;
  readonly outcomes: ReadonlyArray<CombatantOutcome>;
  readonly winner: CombatSide;
};

const damageOf = (rules: CombatRules, from: Combatant, to: Combatant): number | undefined =>
  rules.damage[profileOf(from.role, from.tier)][profileOf(to.role, to.tier)];

/**
 * The order everything reads: the canonical role order, then age, then the identifier. The last
 * one is never a tie-break anybody will notice — it is there so that two troops formed in the
 * same millisecond cannot resolve in two different orders on two readings.
 */
export const byStrikeOrder = (a: Combatant, b: Combatant): number =>
  ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
  a.formedAt - b.formedAt ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type Fighter = {
  readonly combatant: Combatant;
  readonly side: CombatSide;
  strength: number;
  state: TroopState;
  /** Who hit it last, so the riposte can answer the one that struck it. */
  struckBy: string | null;
};

export function resolveEngagement({
  attackers,
  defenders,
  rules,
}: {
  attackers: ReadonlyArray<Combatant>;
  defenders: ReadonlyArray<Combatant>;
  rules: CombatRules;
}): Engagement {
  const line = (combatant: Combatant, side: CombatSide): Fighter => ({
    combatant,
    side,
    strength: combatant.strength,
    state: 'standing',
    struckBy: null,
  });

  const striking = [...attackers].sort(byStrikeOrder).map((one) => line(one, 'attacker'));
  const holding = [...defenders].sort(byStrikeOrder).map((one) => line(one, 'defender'));

  const strikes: Strike[] = [];

  for (const shooter of striking) {
    const target = pick(shooter, holding, rules);
    if (target === null) continue;
    strikes.push(hit(shooter, target, 'strike', 1 / rules.defenderBonus, rules));
  }

  /**
   * **The ripostes come after every strike**, never interleaved: a defender that has already
   * been fired upon answers with what it has left, and one that has not yet been reached
   * answers at full strength. Alternating would make the strike order decide twice.
   */
  for (const holder of holding) {
    if (holder.state !== 'standing') continue;
    const target = riposteTarget(holder, striking, rules);
    if (target === null) continue;
    strikes.push(hit(holder, target, 'riposte', rules.defenderBonus, rules));
  }

  const all = [...striking, ...holding];
  const outcomes = all.map((fighter) => ({
    id: fighter.combatant.id,
    side: fighter.side,
    strengthBefore: fighter.combatant.strength,
    strengthAfter: fighter.strength,
    state: fighter.state,
  }));

  return { strikes, outcomes, winner: winnerOf(striking, holding) };
}

/**
 * **The attacker holds the field only when nothing of the defence still stands.** With a single
 * pass both sides usually walk away, and something has to say whether a raid deactivates the
 * outpost it came for — this is the reading that invents no number: clear the ground, or fail.
 */
function winnerOf(
  attackers: ReadonlyArray<Fighter>,
  defenders: ReadonlyArray<Fighter>,
): CombatSide {
  return defenders.every((one) => one.state !== 'standing') &&
    attackers.some((one) => one.state === 'standing')
    ? 'attacker'
    : 'defender';
}

/**
 * **Nobody screens for anybody.** Each troop strikes the target the table gives it the largest
 * share of, and a defender cannot put a transport in front of its tanks to soak the pass. That
 * is a choice: fodder is an economy of the swarm, and the troop ceiling exists to refuse the
 * swarm. Letting a body block a strike would hand the ceiling straight back.
 */
function pick(
  shooter: Fighter,
  targets: ReadonlyArray<Fighter>,
  rules: CombatRules,
): Fighter | null {
  let kept: Fighter | null = null;
  let best = 0;
  for (const candidate of targets) {
    if (candidate.state !== 'standing') continue;
    const share = damageOf(rules, shooter.combatant, candidate.combatant);
    if (share === undefined || share <= best) continue;
    kept = candidate;
    best = share;
  }
  return kept;
}

/** The one that struck it if it can reach it, the best reachable attacker otherwise, or nothing. */
function riposteTarget(
  holder: Fighter,
  attackers: ReadonlyArray<Fighter>,
  rules: CombatRules,
): Fighter | null {
  const aggressor = attackers.find((one) => one.combatant.id === holder.struckBy);
  if (
    aggressor !== undefined &&
    aggressor.state === 'standing' &&
    damageOf(rules, holder.combatant, aggressor.combatant) !== undefined
  ) {
    return aggressor;
  }
  return pick(holder, attackers, rules);
}

/**
 * `share × (strength / nominal) × modifier × nominal(target)`, rounded, and **capped at what the
 * target has left**: the excess is lost rather than spilling onto the next troop. That single
 * rule is what bounds stacking — six columns on one target waste five of them.
 */
function hit(
  shooter: Fighter,
  target: Fighter,
  phase: Strike['phase'],
  modifier: number,
  rules: CombatRules,
): Strike {
  const share = damageOf(rules, shooter.combatant, target.combatant) ?? 0;
  const raw =
    share *
    (shooter.strength / shooter.combatant.nominalStrength) *
    modifier *
    target.combatant.nominalStrength;
  const losses = Math.min(target.strength, Math.round(raw));

  target.strength -= losses;
  target.struckBy = shooter.combatant.id;
  /**
   * **Routed, not dead** (rule 3 of the project): under a quarter of its nominal a troop breaks
   * contact at once — it stops being a target, it does not riposte, and it goes home. Only a
   * troop taken to nothing is destroyed.
   */
  if (target.strength <= 0) target.state = 'destroyed';
  else if (target.strength < rules.routThreshold * target.combatant.nominalStrength) {
    target.state = 'routed';
  }

  return { phase, by: shooter.combatant.id, target: target.combatant.id, losses };
}
