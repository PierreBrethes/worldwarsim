import type { UnitRole, UnitTier } from './ids';
import { LIFT_CAPACITY, LIFT_COST, ROLE_ORDER, stackRows, TIERS_BY_ROLE } from './troops';

/**
 * **One engagement is one resolution pass** (ADR 0014, revised 16/09/2026 — decision 1b). Both
 * sides fire on the state the pass opened with, the losses land together, and it is over. Three
 * passes turn fourteen of the seventy-five reachable couples into total annihilations —
 * measured, not supposed.
 *
 * **There is no initiative any more.** Attacking an equal force costs more than holding it: the
 * defender carries `garrisonBonus` and the attacker carries nothing, so an attack is worth
 * something only in superiority or in surprise.
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

/**
 * **Les trois transports, victimes par conception** (fiche 08 §9) : ils portent, ils ne
 * combattent pas, et c'est la seule exception au garde-fou « aucun couple n'est un contre
 * absolu ». Nommés une fois ici plutôt que deux — le garde-fou les exempte
 * (`combat.test.ts`), l'abaque les annonce (`domain/gunnery.ts`) — parce que deux listes
 * finissent par diverger sur exactement le genre de règle que personne ne relit.
 */
export const TRANSPORT_PROFILES: ReadonlyArray<CombatProfile> = [
  'landTransport',
  'airTransport',
  'cargo',
];

export type CombatRules = {
  readonly damage: DamageTable;
  readonly garrisonBonus: number;
  readonly routThreshold: number;
  /**
   * One round per this many points of engaged strength, per pass (chiffrage §5). A full
   * mark-1 infantry therefore draws ten rounds to fight once.
   */
  readonly strengthPerRound: number;
  /** What a side whose magazine cannot cover the pass strikes at (chiffrage §4). */
  readonly dryFactor: number;
};

/**
 * **What one side's pass takes out of the national stock** (question 18, settled 25/08). The
 * bill is read at the *entry* of the pass, from the strength each troop brings into it: a
 * company that does not outlive its own salvo still drew its rounds, and reading the strengths
 * once is what keeps the amount independent of the firing order.
 *
 * **Dryness is a property of the side, never of a troop.** The stock is national — there is no
 * order in which to hand rounds to one company before another that would not be a rule
 * invented here. Either the magazine covers the pass, or the whole side fires at `dryFactor`
 * and spends what little it had.
 */
export type Magazine = {
  readonly needed: number;
  /** `needed`, or everything that was left — this debit clamps, it never refuses. */
  readonly spent: number;
  readonly dry: boolean;
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
  /**
   * **`'riposte'` is legacy**, like `decoy` in `convex/validators.ts`: the pass has had a single
   * salvo per side since the revision of 16/09/2026, and every report written from now on says
   * `'strike'` on both sides. The literal survives in the validator because engagements already
   * recorded carry it, and no migration rewrites them.
   */
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
  readonly magazine: Readonly<Record<CombatSide, Magazine>>;
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

/**
 * A troop through the pass: what it fires with never moves — that is `combatant.strength`, the
 * state the pass opened with — and `remaining` only ever falls, under the other side's salvo.
 * Two fields rather than one is the whole of the simultaneity.
 */
type Fighter = {
  readonly combatant: Combatant;
  readonly side: CombatSide;
  remaining: number;
};

export function resolveEngagement({
  attackers,
  defenders,
  ammunition,
  rules,
}: {
  attackers: ReadonlyArray<Combatant>;
  defenders: ReadonlyArray<Combatant>;
  /** Each side's national stock, as it stands when the two forces meet. */
  ammunition: Readonly<Record<CombatSide, number>>;
  rules: CombatRules;
}): Engagement {
  const line = (combatant: Combatant, side: CombatSide): Fighter => ({
    combatant,
    side,
    remaining: combatant.strength,
  });

  const striking = [...attackers].sort(byStrikeOrder).map((one) => line(one, 'attacker'));
  const holding = [...defenders].sort(byStrikeOrder).map((one) => line(one, 'defender'));

  const magazine = {
    attacker: draw(attackers, ammunition.attacker, rules),
    defender: draw(defenders, ammunition.defender, rules),
  };
  const supply = (side: CombatSide) => (magazine[side].dry ? rules.dryFactor : 1);

  /**
   * **One salvo per side, both fired on the state the pass opened with.** The two loops read
   * and write disjoint things — a side fires with `combatant.strength`, which nothing touches,
   * and spends only the opposing `remaining` — so running one before the other in the source is
   * an order of writing, never an order of battle.
   *
   * `garrisonBonus` is applied **once**, on the defender's salvo, and nowhere else. Dividing the
   * attacker's as well — what the sequential rule did — stacked the advantage to ×1.32 of real
   * spread where the constant says ×1.15, so the figure read in `convex/constants.ts` was not the
   * figure the pass applied.
   */
  const salvo = (shooters: ReadonlyArray<Fighter>, at: ReadonlyArray<Fighter>, modifier: number) =>
    shooters.flatMap((shooter) => {
      const target = pick(shooter, at, rules);
      return target === null ? [] : [hit(shooter, target, modifier, rules)];
    });

  const strikes = [
    ...salvo(striking, holding, supply('attacker')),
    ...salvo(holding, striking, supply('defender') * rules.garrisonBonus),
  ];

  /**
   * **The losses are read once, and only here.** Nothing routs or dies inside a salvo: a
   * defender taken under the quarter, or to nothing, has already fired — that is what
   * simultaneous means.
   */
  const outcomes = [...striking, ...holding].map((fighter) => ({
    id: fighter.combatant.id,
    side: fighter.side,
    strengthBefore: fighter.combatant.strength,
    strengthAfter: fighter.remaining,
    state: stateOf(fighter, rules),
  }));

  return { strikes, outcomes, winner: winnerOf(outcomes), magazine };
}

/**
 * **Routed, not dead** (rule 3 of the project): under a quarter of its nominal a troop breaks
 * contact and goes home. Only a troop taken to nothing is destroyed.
 */
function stateOf(fighter: Fighter, rules: CombatRules): TroopState {
  if (fighter.remaining <= 0) return 'destroyed';
  return fighter.remaining < rules.routThreshold * fighter.combatant.nominalStrength
    ? 'routed'
    : 'standing';
}

/**
 * The rounds a force draws for one pass, against what its nation actually holds. Rounded up per
 * troop rather than on the sum: the tranche is a magazine, and half a magazine is a full one.
 */
function draw(force: ReadonlyArray<Combatant>, stock: number, rules: CombatRules): Magazine {
  const needed = force.reduce(
    (rounds, one) => rounds + Math.ceil(one.strength / rules.strengthPerRound),
    0,
  );
  const held = Math.max(0, Math.floor(stock));
  return { needed, spent: Math.min(needed, held), dry: held < needed };
}

/**
 * **The attacker holds the field only when nothing of the defence still stands.** With a single
 * pass both sides usually walk away, and something has to say whether a raid deactivates the
 * outpost it came for — this is the reading that invents no number: clear the ground, or fail.
 */
function winnerOf(outcomes: ReadonlyArray<CombatantOutcome>): CombatSide {
  const standing = (side: CombatSide) =>
    outcomes.some((one) => one.side === side && one.state === 'standing');
  return !standing('defender') && standing('attacker') ? 'attacker' : 'defender';
}

/**
 * **Nobody screens for anybody.** Each troop strikes the target the table gives it the largest
 * share of, and a defender cannot put a transport in front of its tanks to soak the pass. That
 * is a choice: fodder is an economy of the swarm, and the troop ceiling exists to refuse the
 * swarm. Letting a body block a strike would hand the ceiling straight back.
 *
 * **Ce que la passe fait des passagers est répondu à côté** (règle 4 du 18/09), et pas ici.
 * Une troupe terrestre ne traverse qu'à bord (`LIFT_CAPACITY`, fiche 09), donc un convoi accroché
 * en mer est une coque *avec une cargaison d'infanterie* : la passe sait que la coque n'est pas
 * un bouclier, elle ne sait rien de ce qu'elle porte — et elle n'a pas à le savoir. Ce qui reste
 * sans banc une fois les pertes appliquées est **noyé**, et c'est `drownedOf` qui le dit, sur
 * l'état d'après la passe. La question ouverte de la 0014 est close ; le tir ne l'a pas apprise.
 */
function pick(
  shooter: Fighter,
  targets: ReadonlyArray<Fighter>,
  rules: CombatRules,
): Fighter | null {
  let kept: Fighter | null = null;
  let best = 0;
  for (const candidate of targets) {
    if (candidate.remaining <= 0) continue;
    const share = damageOf(rules, shooter.combatant, candidate.combatant);
    if (share === undefined || share <= best) continue;
    kept = candidate;
    best = share;
  }
  return kept;
}

/**
 * `share × (strength / nominal) × modifier × nominal(target)`, rounded, and **capped at what the
 * target has left**: the excess is lost rather than spilling onto the next troop. That single
 * rule is what bounds stacking — six columns on one target waste five of them, and it is the one
 * thing a salvo reads in firing order rather than from the state the pass opened with.
 */
function hit(shooter: Fighter, target: Fighter, modifier: number, rules: CombatRules): Strike {
  const share = damageOf(rules, shooter.combatant, target.combatant) ?? 0;
  const raw =
    share *
    (shooter.combatant.strength / shooter.combatant.nominalStrength) *
    modifier *
    target.combatant.nominalStrength;
  const losses = Math.min(target.remaining, Math.round(raw));

  target.remaining -= losses;

  return { phase: 'strike', by: shooter.combatant.id, target: target.combatant.id, losses };
}

/**
 * **Ce que le large prend quand la coque tombe** (règle 4 du 18/09, révision de l'ADR 0019 §2).
 * Depuis qu'une colonne embarquée peut *rester* en mer, une passe de résolution y a une
 * conséquence que la terre n'a pas : une troupe terrestre qu'aucune coque ne porte plus est
 * **détruite**, et non pas déroutée — il n'y a rien où se replier, et une déroute vers un
 * ancrage serait une nage de mille kilomètres. C'est le prix de rester au large, et la raison
 * d'une escorte.
 *
 * **Le siège est celui du panneau de garnison**, `stackRows` et pas une seconde arithmétique de
 * places : la place que le joueur a vue au départ est la place qui sauve à l'arrivée, et deux
 * lectures de `LIFT_CAPACITY` auraient fini par diverger sur exactement la règle que personne ne
 * relit. Les coques **debout** sont servies d'abord — un passager sauvé sur place ne part pas
 * avec un replié — puis les coques déroutées, qui emportent les leurs dans leur repli.
 *
 * Pure et sans base : elle reçoit les **survivants** de la passe, jamais le plateau. Une coque
 * coulée n'est donc pas dans ses listes, et c'est ce qui rend ses bancs absents plutôt que nuls.
 */
export type SeaUnit = { readonly id: string; readonly role: UnitRole };

export type SeaFate = {
  /** Les passagers que plus aucun banc ne porte : détruits, et jamais déroutés. */
  readonly drowned: ReadonlyArray<string>;
  /** Les passagers qu'une coque en repli emporte : ils quittent le point avec elle. */
  readonly withdrawn: ReadonlyArray<string>;
};

export function drownedOf(
  standing: ReadonlyArray<SeaUnit>,
  routed: ReadonlyArray<SeaUnit>,
): SeaFate {
  const hulls = (units: ReadonlyArray<SeaUnit>) =>
    units.filter((unit) => (LIFT_CAPACITY[unit.role] ?? 0) > 0);
  const afloat = hulls(standing);
  const leaving = hulls(routed);
  /** L'ordre canonique des rôles, puis l'identifiant : deux lectures de la même passe doivent
   *  noyer les deux mêmes hommes, et rien d'autre ici ne tranche entre deux fantassins. */
  const riders = [...standing, ...routed]
    .filter((unit) => (LIFT_COST[unit.role] ?? 0) > 0)
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const pile = [...afloat, ...leaving, ...riders];
  const seated = stackRows(pile, new Set(pile.map((unit) => unit.id)));
  const withdrawing = new Set(leaving.map((hull) => hull.id));

  const drowned: Array<string> = [];
  const withdrawn: Array<string> = [];
  for (const rider of riders) {
    const berth = seated.find((row) => row.troop.id === rider.id)?.carrier ?? null;
    if (berth === null) drowned.push(rider.id);
    else if (withdrawing.has(berth.id)) withdrawn.push(rider.id);
  }
  return { drowned, withdrawn };
}
