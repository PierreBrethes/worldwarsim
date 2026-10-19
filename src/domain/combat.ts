import type { UnitRole, UnitTier } from './ids';
import { firesIndirect } from './indirect-fire';
import {
  carrierIn,
  LIFT_CAPACITY,
  LIFT_COST,
  ROLE_ORDER,
  TIERS_BY_ROLE,
  type Seated,
} from './troops';

/**
 * **One engagement is one resolution pass, and the attacker has the initiative** (grilling of
 * 14/10/2026, B16 — it replaces the simultaneous pass of 16/09). The attacker strikes with what
 * it brings; the losses land; the defender ripostes with what it has left, if anything, and if
 * the table lets it reach. A defender the strike destroyed does not answer. The rout is read
 * once, after the riposte.
 *
 * **The shock is the other reading of the same pass** (B17): two forces charging each other fire
 * together, on the state the pass opened with. Nothing on the server orders it yet.
 *
 * The defence's only advantage is **cover**, as in Advance Wars (decision of 14/10, C1): a troop
 * in garrison of a building, a standing outpost or an objective takes `garrisonDamageTaken` of
 * every blow, and ripostes like anyone else. A pile posted in the open takes them whole.
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
  'artillery',
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
 * pass, before modifiers. An absent cell means "cannot reach" — fifty-one of the hundred and
 * forty-four — and a missing cell is never a zero: a bomber unreachable by a tank is not a
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
  /** The share of a blow a garrison takes — its walls, never a multiplier on its own fire. */
  readonly garrisonDamageTaken: number;
  readonly routThreshold: number;
  /** **La salve bornée** (ADR 0028 §6) : ce qu'un tir indirect touche de l'escouade visée. */
  readonly salvoTargets: number;
};

export type Combatant = {
  readonly id: string;
  readonly role: UnitRole;
  readonly tier: UnitTier;
  readonly strength: number;
  readonly nominalStrength: number;
  /** Breaks a tie between two troops of the same role: the older one fires first. */
  readonly formedAt: number;
  /** In garrison of a building, a standing outpost or an objective: it takes less of each blow. */
  readonly sheltered?: boolean;
  /**
   * **Ses coups, en crans** (ADR 0028 §3) : chaque passe où elle tire en coûte un. À zéro, elle
   * ne tire plus, ni en frappe ni en riposte : elle encaisse. Absent, on ne compte pas (Blitz).
   */
  readonly rounds?: number;
};

/** `initiative`: the attacker strikes, the defender ripostes with the rest. `shock`: together.
 *  `indirect`: the battery strikes from afar, and nobody answers (B20). */
export type PassMode = 'initiative' | 'shock' | 'indirect';

export type CombatSide = 'attacker' | 'defender';

type TroopState = 'standing' | 'routed' | 'destroyed';

type Strike = {
  /** `'riposte'` is the defender's answer under the initiative; a shock writes `'strike'` twice. */
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
  /** Les troupes qui ont tiré : chacune y laisse un cran de coups. */
  readonly fired: ReadonlyArray<string>;
  /** **À sec** : elles auraient tiré, et n'avaient plus de coups. */
  readonly dry: ReadonlyArray<string>;
};

const damageOf = (rules: CombatRules, from: Combatant, to: Combatant): number | undefined =>
  rules.damage[profileOf(from.role, from.tier)][profileOf(to.role, to.tier)];

/**
 * The order everything reads: the canonical role order, then age, then the identifier. The last
 * one is never a tie-break anybody will notice — it is there so that two troops formed in the
 * same millisecond cannot resolve in two different orders on two readings.
 */
const byStrikeOrder = (a: Combatant, b: Combatant): number =>
  ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
  a.formedAt - b.formedAt ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type Fighter = {
  readonly combatant: Combatant;
  readonly side: CombatSide;
  remaining: number;
};

export function resolveEngagement({
  attackers,
  defenders,
  rules,
  mode = 'initiative',
}: {
  attackers: ReadonlyArray<Combatant>;
  defenders: ReadonlyArray<Combatant>;
  rules: CombatRules;
  mode?: PassMode;
}): Engagement {
  const line = (combatant: Combatant, side: CombatSide): Fighter => ({
    combatant,
    side,
    remaining: combatant.strength,
  });

  const striking = [...attackers].sort(byStrikeOrder).map((one) => line(one, 'attacker'));
  const holding = [...defenders].sort(byStrikeOrder).map((one) => line(one, 'defender'));

  /** Under the initiative a troop fires with what it has left; in a shock, with what it brought. */
  const firing = (fighter: Fighter) =>
    mode === 'shock' ? fighter.combatant.strength : fighter.remaining;
  /** **L'artillerie ne tire qu'à distance** (B20) : au contact elle se tait, des deux côtés, et
   *  sous un tir indirect la cible n'a rien à répondre. */
  const fires = (fighter: Fighter) =>
    mode === 'indirect'
      ? fighter.side === 'attacker' && firesIndirect(fighter.combatant.role)
      : !firesIndirect(fighter.combatant.role);
  const fired = new Set<string>();
  const dry = new Set<string>();

  const salvo = (
    shooters: ReadonlyArray<Fighter>,
    at: ReadonlyArray<Fighter>,
    phase: Strike['phase'],
  ) =>
    shooters.filter(fires).flatMap((shooter) => {
      const strength = firing(shooter);
      if (strength <= 0) return [];
      const targets = picks(shooter, at, rules, mode === 'indirect' ? rules.salvoTargets : 1);
      if (targets.length === 0) return [];
      if (shooter.combatant.rounds === 0) {
        dry.add(shooter.combatant.id);
        return [];
      }
      fired.add(shooter.combatant.id);
      return targets.map((target) => {
        const cover = target.combatant.sheltered ? rules.garrisonDamageTaken : 1;
        return hit(shooter, strength, target, cover, phase, rules);
      });
    });

  const struck = salvo(striking, holding, 'strike');
  const strikes = [...struck, ...salvo(holding, striking, mode === 'shock' ? 'strike' : 'riposte')];

  const outcomes = [...striking, ...holding].map((fighter) => ({
    id: fighter.combatant.id,
    side: fighter.side,
    strengthBefore: fighter.combatant.strength,
    strengthAfter: fighter.remaining,
    state: stateOf(fighter, rules),
  }));

  return { strikes, outcomes, winner: winnerOf(outcomes), fired: [...fired], dry: [...dry] };
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
 * **The attacker holds the field only when nothing of the defence still stands.** With a single
 * pass both sides usually walk away, and something has to say whether a raid deactivates the
 * outpost it came for — this is the reading that invents no number: clear the ground, or fail.
 */
export function winnerOf(outcomes: ReadonlyArray<CombatantOutcome>): CombatSide {
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
function picks(
  shooter: Fighter,
  targets: ReadonlyArray<Fighter>,
  rules: CombatRules,
  count: number,
): Fighter[] {
  const kept: Fighter[] = [];
  while (kept.length < count) {
    const next = pick(
      shooter,
      targets.filter((one) => !kept.includes(one)),
      rules,
    );
    if (next === null) break;
    kept.push(next);
  }
  return kept;
}

/**
 * **Ce qu'une salve touche de l'escouade visée** (ADR 0028 §6, la parade à l'escouade monstre) :
 * les `salvoTargets` troupes que la pièce blesse le plus, dans l'ordre de la passe — un pion seul
 * prend un coup, une grosse escouade quatre, jamais ses voisines. Le serveur ne met que celles-là
 * dans la passe : le tireur n'apprend rien du reste.
 */
export function salvoOf<Troop extends Combatant>(
  gun: Combatant,
  squad: ReadonlyArray<Troop>,
  rules: CombatRules,
): Troop[] {
  const line = (combatant: Combatant, side: CombatSide): Fighter => ({
    combatant,
    side,
    remaining: combatant.strength,
  });
  const fighters = [...squad].sort(byStrikeOrder).map((one) => line(one, 'defender'));
  return picks(line(gun, 'attacker'), fighters, rules, rules.salvoTargets).map(
    (fighter) => fighter.combatant as Troop,
  );
}

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
 * rule is what bounds stacking — six columns on one target waste five of them.
 *
 * **A riposte that reaches takes at least one** (decision of 14/10, C2): a light tank the heavy
 * one leaves at three of twelve answers for .375, and the rounding made that a free hit no table
 * value would cure. The floor is the riposte's alone — a strike and a shock are fired whole, and
 * nothing in them rounds a survivor's answer away.
 */
function hit(
  shooter: Fighter,
  strength: number,
  target: Fighter,
  modifier: number,
  phase: Strike['phase'],
  rules: CombatRules,
): Strike {
  const share = damageOf(rules, shooter.combatant, target.combatant) ?? 0;
  const raw =
    share *
    (strength / shooter.combatant.nominalStrength) *
    modifier *
    target.combatant.nominalStrength;
  const floor = phase === 'riposte' && share > 0 ? 1 : 0;
  const losses = Math.min(target.remaining, Math.max(floor, Math.round(raw)));

  target.remaining -= losses;

  return { phase, by: shooter.combatant.id, target: target.combatant.id, losses };
}

/**
 * **Ce que le large prend quand la coque tombe** (règle 4 du 18/09, révision de l'ADR 0019 §2).
 * Depuis qu'une colonne embarquée peut *rester* en mer, une passe de résolution y a une
 * conséquence que la terre n'a pas : une troupe terrestre qu'aucune coque ne porte plus est
 * **détruite**, et non pas déroutée — il n'y a rien où se replier, et une déroute vers un
 * ancrage serait une nage de mille kilomètres. C'est le prix de rester au large, et la raison
 * d'une escorte.
 *
 * **On est à bord d'un transport, pas d'une place** (révision de l'ADR 0025, 15/10) : la noyade
 * lit qui porte qui, comme le joueur l'a vu — personne ne change de coque au milieu d'une passe, et
 * le camion chargé coule avec son cargo et ses fusiliers.
 *
 * Pure et sans base : elle reçoit les **survivants** de la passe, jamais le plateau. Une coque
 * coulée n'est donc pas dans ses listes, et c'est ce qui laisse ses passagers sans banc.
 */
export type SeaUnit = Seated;

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
  const all = [...standing, ...routed];
  const leaving = new Set(routed.map((unit) => unit.id));
  /** La coque au bout de la chaîne : un fusilier est à bord d'un camion, lui-même à bord. */
  const hullOf = (unit: SeaUnit): SeaUnit | null => {
    let at = carrierIn(unit, all);
    while (at !== null && (LIFT_CAPACITY[at.role] ?? 0) === 0) at = carrierIn(at, all);
    return at;
  };
  const drowned: Array<string> = [];
  const withdrawn: Array<string> = [];
  for (const rider of all.filter((unit) => (LIFT_COST[unit.role] ?? 0) > 0)) {
    const hull = hullOf(rider);
    if (hull === null) drowned.push(rider.id);
    else if (leaving.has(hull.id)) withdrawn.push(rider.id);
  }
  return { drowned, withdrawn };
}
