/**
 * **Every number in this file is a placeholder**, and this is the one place to correct when the
 * simulator takes over — nothing numeric belongs anywhere else. The report calibrated on three
 * resources (ADR 0015) does not carry over. Orders of magnitude were chosen so a fresh nation
 * raises its first buildings within the first hours of a 48-hour season, and so a foundry is
 * worth more than the ore it eats. Nothing more was measured.
 */

import type { BuildingKey, DepositKey, ResourceKey, UnitRole } from '../src/domain/ids';
import type { CombatRules, DamageTable } from '../src/domain/combat';
import type { Conversion } from '../src/domain/economy';
import { COST_BY_MEDIUM, KM_PER_UNIT } from '../src/domain/routing';
import type { UnitTier } from '../src/domain/troops';

export { NATIONS } from '../src/domain/ids';

export type Costs = Readonly<Partial<Record<ResourceKey, number>>>;

/** Per hour and per level of the exploitation building sitting on the deposit. */
export const EXTRACTION_PER_HOUR: Readonly<Record<DepositKey, number>> = {
  food: 12,
  textile: 8,
  coal: 10,
  oil: 6,
  ore: 9,
};

/**
 * The three chains, in the order they settle. Foundry first: the alloy it makes in a window is
 * what the arsenal spends in the same one, and reversing them would idle the arsenal for a
 * reading every time both are built.
 */
export const CHAINS: Readonly<
  Record<
    'foundry' | 'arsenal' | 'quartermaster',
    Omit<Conversion, 'perHour' | 'by'> & { perHourPerLevel: number }
  >
> = {
  foundry: {
    output: 'alloy',
    inputs: [
      ['ore', 2],
      ['coal', 1],
    ],
    perHourPerLevel: 4,
  },
  arsenal: { output: 'ammunition', inputs: [['alloy', 1]], perHourPerLevel: 3 },
  quartermaster: { output: 'bandages', inputs: [['textile', 1]], perHourPerLevel: 3 },
};

export type ChainKey = keyof typeof CHAINS;

/**
 * **A chain that eats a matter spent elsewhere is commanded by the player.** An arsenal at level
 * 3 quietly takes 216 alloy a day from a nation saving 430 for a carrier, and no screen names it.
 *
 * Written down rather than derived from the cost tables: coal appears in half the building bills,
 * so a derivation would command every chain and the decision would stop being one.
 */
export const COMMANDED_CHAINS: ReadonlyArray<ChainKey> = ['arsenal'];

export const isCommanded = (key: BuildingKey): boolean =>
  (COMMANDED_CHAINS as ReadonlyArray<string>).includes(key);

/**
 * Low by default so warehouses become necessary targets (fiche 02).
 * Each level raises all eight ceilings; legacy depots count as warehouses.
 */
export const BASE_CAP = 400;
export const STORAGE_CAP_PER_LEVEL = 600;

export const BUILDING_SPEC: Readonly<
  Record<BuildingKey, { readonly cost: Costs; readonly minutes: number }>
> = {
  hq: { cost: { alloy: 60, coal: 40 }, minutes: 45 },
  farm: { cost: { alloy: 20 }, minutes: 20 },
  mill: { cost: { alloy: 20 }, minutes: 20 },
  mine: { cost: { alloy: 30 }, minutes: 30 },
  oilWell: { cost: { alloy: 45 }, minutes: 40 },
  foundry: { cost: { alloy: 50, coal: 30 }, minutes: 50 },
  arsenal: { cost: { alloy: 60, coal: 20 }, minutes: 55 },
  quartermaster: { cost: { alloy: 35, textile: 20 }, minutes: 35 },
  barracks: { cost: { alloy: 40, food: 30 }, minutes: 40 },
  airfield: { cost: { alloy: 70, oil: 20 }, minutes: 70 },
  port: { cost: { alloy: 65, coal: 20 }, minutes: 65 },
  listening: { cost: { alloy: 35, coal: 15 }, minutes: 40 },
  billets: { cost: { alloy: 25, food: 40 }, minutes: 30 },
  warehouse: { cost: { alloy: 30, coal: 10 }, minutes: 25 },
  // Legacy tariffs still price queued work, refunds and industry.
  depot: { cost: { alloy: 40, coal: 15 }, minutes: 30 },
};

/**
 * `plan-progression-v1.md`: one headquarters level, one new question — the ground at 1, then the
 * army at 2. **The age of the army carries the sea and the air with it** (66a, 04/09): the port
 * and the airfield used to wait for 3, and the test season measured what that cost an island —
 * 577 alloy for the first projection by sea against 198 by land, on an endowment of 500. A
 * nation whose only way out is the water cannot have that way out priced two levels above its
 * neighbour's road. What stays at 3 is the tank and the whole mark-2 step, which is a depth.
 *
 * Exhaustive by type: dropping a key breaks the build rather than quietly unlocking it at zero.
 *
 * **The warehouse and the depot stay at 1, and that is not a rounding**: storage is what protects
 * the absent player, so raising it would punish the one who can do nothing about it.
 */
export const UNLOCKED_AT: Readonly<Record<BuildingKey, number>> = {
  hq: 1,
  farm: 1,
  mill: 1,
  mine: 1,
  oilWell: 1,
  foundry: 1,
  quartermaster: 1,
  warehouse: 1,
  depot: 1,
  barracks: 2,
  billets: 2,
  arsenal: 2,
  listening: 2,
  airfield: 2,
  port: 2,
};

/**
 * **`unlockLevel` is a width, `tier2HqLevel` is a depth: they must never be merged.** The
 * catalogue has to open across the whole run, and the mark-2 step has to stay *ahead* of where
 * the player already stands, or raising the headquarters rewards nothing. Somebody will try to
 * unify them; this paragraph is why not.
 *
 * It reads the ladder straight since the season has one single run (ADR 0020 §11): the
 * reprojection it used to do existed only to squeeze that ladder onto a shorter format.
 */
export const unlockLevel = (key: BuildingKey): number => UNLOCKED_AT[key];

/**
 * **Placements are carried by each site, never by the nation** (ADR 0020 §10). National soil
 * carries two per headquarters level; an outpost carries **its own level**, which is why an
 * outpost is worth raising and why a level-3 one is a ranked target — putting it out of service
 * freezes three buildings.
 *
 * The global ceiling `buildingCap(hqLevel)` it replaces refused for a reason nobody could read:
 * at the launch the national foundation ate the whole of it — zero free placement, and *fewer*
 * the richer the ground, since the debt follows the deposits. That inverted the distribution
 * guard rails of ADR 0015, and it punished the expansion ADR 0020 exists to ask for. The brake
 * on expansion is the upkeep now (`OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL`), not a count.
 *
 * ADR 0015 still holds: no game quantity is counted in regions. Two per level is a count of
 * *levels*, and the reach of an outpost stays a radius in kilometres.
 */
export const PLACEMENTS_PER_HQ_LEVEL = 2;

/** What national soil carries. An outpost carries its level and needs no function for it. */
export const homeSlots = (hqLevel: number): number => PLACEMENTS_PER_HQ_LEVEL * hqLevel;

/**
 * **Une seule ligne de départ** (ADR 0020 §11). L'escarmouche et la campagne ont disparu le
 * 31/08 : sans horloge, une partie n'a plus de fin programmée, et ce sont les valeurs de la
 * campagne qui décrivent le jeu réel. Ce qui reste, ce sont ces quelques nombres — jamais une
 * table, jamais une clé de format posée à côté d'un taux d'extraction.
 */

/** Where the headquarters stands from the first minute (ADR 0015). */
export const HQ_LEVEL_AT_LAUNCH = 1;
export const MAX_HQ_LEVEL = 5;

/** **What the home screen offers, never what a season is** (révision du 27/08 de l'ADR 0017) :
 *  une saison peut n'avoir aucune horloge. */
export const DEFAULT_DURATION_HOURS = 168;

/**
 * **Measured, not chosen** (`node WWS/simulation/opening/run.mjs --sweep`, assiduous player).
 * The 500 is read on the campaign's first 48 hours, at the point where the empty connections
 * stop falling. **Fragile, and knowingly so**: over the whole season the sweep is not monotonic
 * (35 actions at 420, 28 at 800), because there the order of the clicks weighs more than the
 * parameter. That is a symptom, never a knob.
 */
export const STARTING_ALLOY = 500;

/**
 * **The fuse.** Oil is the one resource a nation can be born unable to make, so this reserve
 * pays the *first journey towards* oil and the fact that it runs out is the engine of the
 * nations that lack it. Short-lived as a *quantity*: the day `consommation-continue.md` makes
 * the motorised drink it becomes a dated fuse, **sized in journeys, never in litres**.
 *
 * No table per nation, deliberately: the asymmetry comes from the map, and eight hand-written
 * values would be eight more numbers to balance for an effect geography gives away free.
 */
export const STARTING_OIL = 40;

/**
 * **How many passes a nation can fight before its arsenal has to exist.** A full company of
 * infantry draws ten rounds per engagement (`STRENGTH_PER_ROUND`), so eighty is eight
 * company-passes, and the arsenal has the whole season to arrive.
 *
 * **Its old justification is void, and the number survives it unchanged** (question 18, 25/08):
 * it was sized against a recruitment bill that no longer exists, and the measurement behind it
 * tested a removed rule. Nothing here is calibrated any more, and the simulator cannot help —
 * it does not model combat at all.
 */
export const STARTING_AMMUNITION = 80;

/**
 * **The foundation is read off the ground, never off a list** (decision of 25/08): one extractor
 * per dry resource the player's own country holds, and a well **only** where there is oil — six
 * nations out of eight hold none, and a debt they could never place opens on nothing. The
 * `foundry`, `warehouse` and `arsenal` left with it: they are what a player decides to do with a
 * ground, not what the ground carries.
 *
 * The order is fixed rather than natural, because a season has to name its debts in the same
 * order twice running: `me.foundation[0]` is what the card points at first.
 */
const FOUNDATION_ORDER: ReadonlyArray<DepositKey> = ['ore', 'coal', 'food', 'textile', 'oil'];

/** Which extractor works which ground. The inverse of `EXPLOITED_DEPOSITS`, and the one place
 *  the *mine on two deposits* becomes two separate debts rather than one. */
export const FOUNDATION_EXTRACTORS: Readonly<Record<DepositKey, BuildingKey>> = {
  ore: 'mine',
  coal: 'mine',
  food: 'farm',
  textile: 'mill',
  oil: 'oilWell',
};

/** It takes the deposits rather than the nation on purpose: **this file is read by the client**,
 *  and reaching for the map here would drag 312 kB of `region-index.json` into the bundle. The
 *  join with a nation is `foundationOwed`, in `regions.ts`. */
export const foundationFor = (deposits: ReadonlySet<DepositKey>): ReadonlyArray<BuildingKey> =>
  FOUNDATION_ORDER.filter((deposit) => deposits.has(deposit)).map(
    (deposit) => FOUNDATION_EXTRACTORS[deposit],
  );

export const LEVEL_COST_FACTOR = 1.8;

export function buildCost(key: BuildingKey, level: number): Costs {
  const factor = LEVEL_COST_FACTOR ** (level - 1);
  return Object.fromEntries(
    Object.entries(BUILDING_SPEC[key].cost).map(([resource, amount]) => [
      resource,
      Math.round(amount * factor),
    ]),
  );
}

export function buildMinutes(key: BuildingKey, level: number): number {
  return Math.round(BUILDING_SPEC[key].minutes * LEVEL_COST_FACTOR ** (level - 1));
}

/**
 * Enough to **deploy**, not to settle (fiche 02). The headquarters is not in the list — it stands
 * from the launch (ADR 0015). **The alloy, the oil and the ammunition are missing on purpose**:
 * they are the three figures of the starting line, each named on its own above, and everything
 * else is shared. Never a figure per nation — the asymmetry comes from the map.
 */
export const STARTING_STOCK: Readonly<
  Record<Exclude<ResourceKey, 'alloy' | 'oil' | 'ammunition'>, number>
> = {
  food: 120,
  textile: 40,
  coal: 20,
  ore: 20,
  bandages: 0,
};

/** The whole endowment, the three figures of the starting line included — what `endow` hands
 *  out and what a test reads to say what a player opens with. */
export const STARTING_KIT: Readonly<Record<ResourceKey, number>> = {
  ...STARTING_STOCK,
  alloy: STARTING_ALLOY,
  oil: STARTING_OIL,
  ammunition: STARTING_AMMUNITION,
};

/**
 * ADR 0014 and `chiffrage-combat.md` §1, copied: 50 soldiers, 12 tanks, 6 ships. The carrier
 * counts its air group, not its hulls — at one hit point it would die at a stroke. Absent means
 * the tier does not exist for that role, and `troops.test.ts` holds this and `TIERS_BY_ROLE`
 * together rather than trusting them to stay in step.
 */
export const NOMINAL_STRENGTH: Readonly<
  Record<UnitRole, Readonly<Partial<Record<UnitTier, number>>>>
> = {
  infantry: { 1: 50, 2: 30 },
  armor: { 1: 12, 2: 6 },
  landTransport: { 1: 24 },
  fighter: { 1: 12 },
  bomber: { 1: 9 },
  airTransport: { 1: 6 },
  escort: { 1: 6 },
  cargo: { 1: 8 },
  carrier: { 1: 24 },
};

export function nominalStrength(role: UnitRole, tier: UnitTier): number {
  const strength = NOMINAL_STRENGTH[role][tier];
  if (strength === undefined) throw new Error(`no tier ${tier} for ${role}`);
  return strength;
}

/**
 * Resource cargo carried by one troop at full strength. This never seats another troop:
 * `LIFT_CAPACITY` remains the separate passenger rule used by crossings.
 *
 * @a-mesurer every role; no season simulation models plunder cargo yet
 */
export const CARRY_CAPACITY_BY_ROLE: Readonly<Record<UnitRole, number>> = {
  infantry: 40,
  armor: 0,
  landTransport: 120,
  fighter: 0,
  bomber: 0,
  airTransport: 80,
  escort: 0,
  cargo: 240,
  carrier: 0,
};

/**
 * Cost and duration of **one tier-1 troop**. A batch is a troop, so nothing here multiplies by
 * a count any more (ADR 0014).
 */
export const COST_BY_ROLE: Readonly<Record<UnitRole, { alloy: number; minutes: number }>> = {
  infantry: { alloy: 18, minutes: 20 },
  armor: { alloy: 95, minutes: 70 },
  landTransport: { alloy: 40, minutes: 45 },
  fighter: { alloy: 110, minutes: 90 },
  bomber: { alloy: 160, minutes: 120 },
  airTransport: { alloy: 90, minutes: 75 },
  escort: { alloy: 175, minutes: 180 },
  cargo: { alloy: 120, minutes: 100 },
  carrier: { alloy: 430, minutes: 480 },
};

/**
 * One round per five points of engaged strength, per pass (chiffrage §5). **The pass is the only
 * facturation** (question 18, 25/08): recruitment used to bill the magazine up front as well,
 * which priced the same rounds twice. A troop is not expensive to raise, it is expensive to keep
 * fighting.
 */
export const STRENGTH_PER_ROUND = 5;

export const TIER_2_FACTOR = 1.6;

/**
 * ADR 0015: research lives at the headquarters, not on the projection buildings. **The gate is
 * counted above the launch, never in the absolute** (ADR 0017) — written as an absolute it
 * would open mark 2 wherever the headquarters happens to be planted, and a step that does not
 * exist is not a step.
 *
 * **This is a depth and `unlockLevel` is a width — do not merge them**; see the paragraph there.
 */
export const TIER_2_LEVELS_ABOVE_LAUNCH = 1;

export const TIER_2_HQ_LEVEL = HQ_LEVEL_AT_LAUNCH + TIER_2_LEVELS_ABOVE_LAUNCH;

/**
 * **The weapon and its counter arrive together** (`plan-progression-v1.md`, question 6c): the
 * damage table makes mark-2 infantry the answer to a tank (.65/.45 against .15/.05), so opening
 * the tank first would hand out thirty-three hours of unanswerable armor. It reads the mark-2
 * threshold rather than holding a table of its own. Zero means "nothing above the building".
 */
export const roleHqLevel = (role: UnitRole): number => (role === 'armor' ? TIER_2_HQ_LEVEL : 0);

/**
 * **The level the projection building must reach to form the role** (67b, 04/09). A *width per
 * site*, never to be confused with `roleHqLevel`, which is a depth at the headquarters: since
 * `cappedByHq` holds a site under its headquarters, a barracks at 3 already implies a
 * headquarters at 3, and the tank keeps its counter (mark-2 infantry, opened at the headquarters)
 * in front of it — `invariants.test.ts` holds that, no reading does.
 *
 * It is what gives a projection site a reason to be raised at all: before this the second level
 * of a barracks bought nothing. Exhaustive by role, and never above `MAX_HQ_LEVEL` — a role
 * written at 6 would be a role hidden for the whole season.
 */
export const ROLE_SITE_LEVEL: Readonly<Record<UnitRole, number>> = {
  infantry: 1,
  landTransport: 2,
  armor: 3,
  cargo: 1,
  escort: 2,
  carrier: 5,
  fighter: 1,
  airTransport: 2,
  bomber: 3,
};

export const roleSiteLevel = (role: UnitRole): number => ROLE_SITE_LEVEL[role];

/** Nearly inert since a batch became a single troop — the troop ceiling below bites first. Kept
 *  as a guard against an unbounded queue, not as a balance knob. */
export const MAX_QUEUED_BATCHES = 12;

/**
 * **One ceiling, and it counts troops — never men**: adding the nominal strengths would add tanks
 * to destroyers. The step is derived, so the simulator can sweep `TROOP_CAP_TARGET` alone.
 *
 * **Assumed: this is an anti-swarm rule, not a balance between domains.** It only bites on the
 * cheap roles — 24 infantries cost 432 alloy, 24 carriers 10 320 — so the ceiling speaks for the
 * infantry and the cost for the navy; without it one barracks turns out some 500 infantries over
 * a seven-day season. Making it bite everywhere would take a per-role price in slots, refused on
 * purpose. Do not "fix" this. No per-domain ceiling either: one stock, like the movement slots
 * (ADR 0006).
 */
export const TROOP_CAP_BASE = 8;
export const TROOP_CAP_TARGET = 24;
export const BILLETS_LEVELS_TO_CAP = 8;

export const TROOP_CAP_PER_BILLETS_LEVEL =
  (TROOP_CAP_TARGET - TROOP_CAP_BASE) / BILLETS_LEVELS_TO_CAP;

/**
 * The **sum of the levels of every billets** — a ceiling adds up over sites, where the
 * headquarters cap and the tier gates read the best instance alone.
 *
 * **The second billets is a compulsory toll, and that is the decision**: `cappedByHq` stops a
 * billets at 4 under a headquarters at 5, so one caps a nation at 16 troops and reaching 24 costs
 * at least two building slots. Each extra site saves matter (2×4: 594 alloy, 4×2: 280), so the
 * trade hides no optimum.
 */
export const troopCap = (billetsTotalLevel: number): number =>
  Math.min(
    TROOP_CAP_TARGET,
    Math.floor(TROOP_CAP_BASE + TROOP_CAP_PER_BILLETS_LEVEL * billetsTotalLevel),
  );

export function chainSpeed(hqLevel: number): number {
  return 1 + Math.max(0, hqLevel - 1) * 0.225;
}

export function recruitmentCost(role: UnitRole, tier: UnitTier, hqLevel: number) {
  const base = COST_BY_ROLE[role];
  const factor = tier === 2 ? TIER_2_FACTOR : 1;
  return {
    alloy: Math.round(base.alloy * factor),
    minutes: Math.round((base.minutes * factor) / chainSpeed(hqLevel)),
  };
}

/**
 * **The damage table of `chiffrage-combat.md` §2, copied literally**: the share of the defender's
 * nominal strength a full-strength attacker destroys in one pass, before modifiers. A **missing**
 * cell is "cannot reach", never a zero — seventy-five reachable couples out of a hundred and
 * twenty-one, which `combat.test.ts` replays.
 *
 * Three deliberate departures from design sheet 08 must survive any edit: the token anti-air
 * value of mark-2 infantry (.06 to .12, so a pure air force pays *something*), the fighter as the
 * only answer to the bomber, and the carrier's mediocre line — its strength is reach, not power.
 */
export const DAMAGE_TABLE: DamageTable = {
  infantry1: { infantry1: 0.5, infantry2: 0.55, armor1: 0.15, armor2: 0.05, landTransport: 0.7 },
  infantry2: {
    infantry1: 0.35,
    infantry2: 0.4,
    armor1: 0.65,
    armor2: 0.45,
    landTransport: 0.6,
    fighter: 0.06,
    bomber: 0.1,
    airTransport: 0.12,
  },
  armor1: { infantry1: 0.7, infantry2: 0.65, armor1: 0.5, armor2: 0.25, landTransport: 0.85 },
  armor2: { infantry1: 0.75, infantry2: 0.7, armor1: 0.75, armor2: 0.5, landTransport: 0.9 },
  landTransport: {
    infantry1: 0.1,
    infantry2: 0.1,
    armor1: 0.05,
    armor2: 0.02,
    landTransport: 0.15,
  },
  fighter: {
    infantry1: 0.25,
    infantry2: 0.25,
    armor1: 0.1,
    armor2: 0.05,
    landTransport: 0.45,
    fighter: 0.5,
    bomber: 0.75,
    airTransport: 0.85,
    escort: 0.1,
    cargo: 0.25,
    carrier: 0.12,
  },
  bomber: {
    infantry1: 0.45,
    infantry2: 0.45,
    armor1: 0.6,
    armor2: 0.55,
    landTransport: 0.6,
    fighter: 0.08,
    bomber: 0.2,
    airTransport: 0.25,
    escort: 0.55,
    cargo: 0.6,
    carrier: 0.65,
  },
  airTransport: {},
  escort: {
    infantry1: 0.1,
    infantry2: 0.1,
    armor1: 0.05,
    armor2: 0.02,
    landTransport: 0.12,
    fighter: 0.15,
    bomber: 0.15,
    airTransport: 0.18,
    escort: 0.5,
    cargo: 0.7,
    carrier: 0.45,
  },
  cargo: { escort: 0.05, cargo: 0.1, carrier: 0.05 },
  carrier: {
    infantry1: 0.15,
    infantry2: 0.15,
    armor1: 0.08,
    armor2: 0.04,
    landTransport: 0.25,
    fighter: 0.4,
    bomber: 0.35,
    airTransport: 0.45,
    escort: 0.3,
    cargo: 0.4,
    carrier: 0.3,
  },
};

/**
 * The modifiers of `chiffrage-combat.md` §4 a rule may read **today**. Two of the five are missing
 * on purpose: **the terrain**, because `RegionType` is a stand-in and a modifier would multiply
 * noise (`CLAUDE.md` forbids a rule reading it without its own ADR); and **the pincer** (×1.20),
 * because "two converging movements" is one number and three undecided definitions.
 */
export const DEFENDER_BONUS = 1.15;
export const ROUT_THRESHOLD = 0.25;

/** Chiffrage §4, design sheet 08 §7: a side whose stock cannot cover the pass fires at ×0.60 and
 *  never declines the engagement — an army out of ammunition is bad, not absent. */
export const DRY_AMMUNITION_FACTOR = 0.6;

export const COMBAT_RULES: CombatRules = {
  damage: DAMAGE_TABLE,
  defenderBonus: DEFENDER_BONUS,
  routThreshold: ROUT_THRESHOLD,
  strengthPerRound: STRENGTH_PER_ROUND,
  dryFactor: DRY_AMMUNITION_FACTOR,
};

/**
 * **How far each role sees** (ADR 0021, revision of 08/09/2026). Detection is passive and does
 * not become weapon range: only the order says whether a mobile contact becomes a pass.
 *
 * @a-mesurer every value; no season simulation models detection
 */
export const DETECTION_RANGE_KM: Readonly<Record<UnitRole, number>> = {
  infantry: 60,
  armor: 60,
  landTransport: 40,
  fighter: 150,
  bomber: 100,
  airTransport: 80,
  escort: 120,
  cargo: 60,
  carrier: 200,
};

/**
 * **A stack sees as far as its best detector, never as their sum** (ADR 0021, revision of
 * 08/09/2026). These are starting points inherited from the abandoned posture brief, not
 * balance claims: the first campaign still has to measure all nine.
 */
export const detectionRangeOf = (roles: ReadonlyArray<UnitRole>): number =>
  roles.reduce((best, role) => Math.max(best, DETECTION_RANGE_KM[role]), 0);

/**
 * **How close one has to stand to be found on arrival.** ADR 0019 §1: it replaces the containment
 * the server cannot compute, since it holds no polygons.
 *
 * Twenty-five kilometres is **an assumed starting point, never measured** — the same status as
 * the passive detection ranges and deliberately not the same value: detecting is seeing,
 * while an arrival is a place one walked to. Wider, aiming stops saying anything;
 * narrower, the point one clicks would have to land on a defender to find him.
 *
 * @a-mesurer an assumed starting point; nothing measures how close is close enough on arrival
 */
export const ARRIVAL_RADIUS_KM = 25;

/**
 * **How far a listening station hears what moves** — design sheet 04's second detector.
 *
 * A hundred and twenty kilometres is a placement in the ordering the design asks for and nothing
 * more: longer than an infantry company's 60 km, because a station bought for forty minutes and
 * thirty-five of alloy has to be worth more than a rifleman standing still. It hears and catches
 * nothing by itself.
 *
 * A station has no point of its own: it listens from its region's (`regionFacts`).
 *
 * @a-mesurer a rank in the ordering the design asks for, and nothing more
 */
export const LISTENING_STATION_RADIUS_KM = 120;

/**
 * **What one troop eats an hour, whatever it is** (`consommation-continue.md` D1). One constant
 * and no table of nine: `nominalStrength` is not the same unit from one role to the next, so
 * feeding a carrier "in proportion to 24" would make it half the price of an infantry while it
 * carries three thousand men. A flat rate also keeps `chiffrage-combat.md` §5 for free — losing
 * men is never an economy — and it costs proportionally more to hold a cheap troop than an
 * expensive one, which is a third channel against the swarm.
 *
 * One an hour against a farm's twelve: an army at the ceiling of twenty-four is two farms at
 * level one, which is the scale the number was picked to read at. Never measured.
 *
 * @a-mesurer picked to read against a farm at level one, never measured
 */
export const FOOD_UPKEEP_PER_TROOP_PER_HOUR = 1;

/**
 * What a troop eats **outside every anchor of its own** (ADR 0019 §4). Without it, "at its own
 * risk and peril" names no risk: a flat rate plus "nothing dies when dry" (D3) would make twenty
 * free sentinels the cheapest way to empty the fog (ADR 0005).
 *
 * **Two is an assumed starting point, never a measured value**, chosen so the rule exists and can
 * be measured. The known risk is that at ×2 the surcharge drowns in an economy where alloy is the
 * bottleneck and food abundant; if the measurement says so, the value rises and the rule does not.
 *
 * @a-mesurer assumed; at ×2 the surcharge may drown in an economy where alloy is the bottleneck
 */
export const UPKEEP_UNSUPPLIED_MULTIPLIER = 2;

/**
 * Design sheet 03. **Neither figure is in the design** — it says "temporarily" and "then an
 * immunity window" and stops there. Both are placeholders shaped only so the pair reads: a night
 * out of service, half a night of respite, on a 48-hour season. The immunity is what keeps the
 * rule from collapsing into a permanent shutdown by relays of cheap raids.
 *
 * @a-mesurer neither figure is in the design; shaped only so the pair reads on a 48-hour season
 */
export const OUTPOST_DISABLED_HOURS = 6;
export const OUTPOST_IMMUNITY_HOURS = 3;

/**
 * First playable values for the warehouse expedition. They establish the two separate waits —
 * holding the site, then keeping it out of service — but no simulation or game has balanced
 * either one.
 *
 * @a-mesurer starting points only; no simulation models plunder presence or warehouse downtime
 */
export const PLUNDER_HOURS_PRESENT = 2;
export const PLUNDER_DISABLED_HOURS = 12;

/**
 * A battlefield remainder gets one fixed window from the pass that created it. Collecting part
 * of it never starts a fresh window.
 *
 * @a-mesurer provisional lifetime; no season simulation models crate discovery or collection
 */
export const LOOT_CRATE_HOURS = 2;

/**
 * The public rumor waits after the physical remainder appears, then names only a search disk.
 * Its public end remains the crate's original deadline even when the crate was collected early.
 *
 * @a-mesurer provisional disclosure delay and search radius; no season simulation models them
 */
export const LOOT_RUMOR_DELAY_MINUTES = 10;
export const LOOT_RUMOR_RADIUS_KM = 200;

/**
 * **What one outpost costs to hold, per level and per hour** (ADR 0020 §10). It is the brake on
 * expansion, deliberately put here rather than on the founding bill: a rising founding cost
 * punishes once, at the purchase, and is then forgotten; an upkeep weighs for as long as the
 * empire stands. An over-extended player is structurally fragile in war, and one who loses
 * points sees his bill fall — "a crushed player stays a nuisance", applied to the economy.
 *
 * Nothing dies when the reserve runs dry (`consommation-continue.md` D3): the stock dives, and
 * that is all.
 *
 * **Assumed values, never measured** — same standing and same paragraph as
 * `UPKEEP_UNSUPPLIED_MULTIPLIER` above.
 *
 * @a-mesurer assumed; nothing measures what an outpost should cost to hold against a farm's yield
 */
export const OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL: Costs = { food: 2, coal: 1 };

/**
 * **Ce qu'un avant-poste ouvre autour de lui, et qui monte avec son niveau** (ADR 0020 §1,
 * révision du 31/08). Un rayon, jamais un compte de régions — c'est la seule forme que la règle
 * peut prendre (ADR 0015).
 *
 * Quatre cents kilomètres, la valeur d'avant, couvraient **le quart de la France** pour un seul
 * point posé : au premier contrôle visuel la tache d'un avant-poste de niveau 1 se lisait comme
 * une conquête. Cent vingt kilomètres est une poignée de départements, et le reste s'achète —
 * *là où je peux bâtir est là où je tiens* ne bouge pas, les deux montent ensemble.
 *
 * @a-mesurer placeholders assumés, du même statut que l'entretien : mesurés sur ce qu'ils couvrent d'une carte, jamais sur une partie qu'ils auraient changée
 */
export const OUTPOST_REACH_KM_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 120,
  2: 180,
  3: 240,
};

const MAX_REACH_LEVEL = Object.keys(OUTPOST_REACH_KM_BY_LEVEL).length;

/** Le rayon d'un point, par son niveau. Un niveau au-delà de la table garde le dernier rayon :
 *  une amélioration future ne doit pas rendre un point aveugle en attendant sa ligne. */
export const outpostReachKm = (level: number): number =>
  OUTPOST_REACH_KM_BY_LEVEL[Math.min(Math.max(Math.trunc(level), 1), MAX_REACH_LEVEL)]!;

/**
 * **What a logistics relay does to the stretch of road that passes it** (design sheet 03) — the
 * only specialization that touches travel time, and with it the arbitration the sheet names: an
 * army, or the means to project it.
 *
 * One and a half is shaped so the relay reads as a decision rather than a rounding: on a route
 * entirely under its reach it turns fourteen minutes per thousand kilometres into a little over
 * nine. Nothing simulates it. **It never touches an opponent**, and the reading is made at
 * departure like every other timing of the game.
 *
 * @a-mesurer shaped so the relay reads as a decision rather than a rounding
 */
export const RELAY_SPEED_MULTIPLIER = 1.5;

/**
 * **The one measured number of movement**, straight out of the simulation report: 14 minutes per
 * 1 000 km on land. Everything else about a duration is derived from it — a route already carries
 * its cost in sea-equivalent units (ADR 0012), so the minute price of one cost unit is that
 * measurement read back through the land multiplier. Two hand-written numbers would drift, and a
 * drift here moves every trip in the game.
 */
export const MINUTES_PER_1000_KM_ON_LAND = 14;

export const MINUTES_PER_ROUTE_UNIT =
  (MINUTES_PER_1000_KM_ON_LAND * KM_PER_UNIT) / (1000 * COST_BY_MEDIUM.land);

export const routeMinutes = (costUnits: number): number =>
  Math.max(1, Math.round(costUnits * MINUTES_PER_ROUTE_UNIT));

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_LAUNCH = 2;

/**
 * **The bar of the test victory** (`src/domain/victory.ts`). A placeholder, and it goes with the
 * scaffold it serves the day the share of the map replaces it (ADR 0020).
 *
 * @a-mesurer the bar of a scaffold, measured by nothing — it leaves with the scaffold
 */
export const REDUCTION_FACTOR = 0.5;

/** Design sheet 07. The duration is **fixed, not chosen**: the window forbids any arrival while
 *  it lasts, so a player who set its length would set how long he is untouchable. He picks when
 *  he sleeps, never how long. */
export const REST_WINDOW_MINUTES = 7 * 60;
/** En minutes **UTC**, comme tout ce qui touche la plage côté serveur : 23h00 à Paris l'été,
 *  22h00 l'hiver — la valeur d'avant, écrite dans le fuseau où le serveur la lit. */
export const DEFAULT_REST_START_MINUTES = 21 * 60;

export const restWindowFrom = (startMinutes: number) => ({
  startMinutes,
  endMinutes: (startMinutes + REST_WINDOW_MINUTES) % 1440,
});

export const DEFAULT_REST_WINDOW = restWindowFrom(DEFAULT_REST_START_MINUTES);

/**
 * **Au bout de combien de temps un relevé est aussi délavé qu'il le sera jamais** (ADR 0020 §5).
 * Ce n'est pas une durée de vie : une région relevée le reste pour toujours, elle pâlit
 * seulement jusqu'à ce plancher (`FADED_WASH`), parce qu'une couleur qui disparaîtrait
 * redeviendrait *vierge* et effacerait un déplacement que le joueur a payé.
 *
 * Vingt-quatre heures est la journée du jeu asynchrone : un joueur qui passe une fois par jour
 * doit retrouver sa carte franche là où il vient de regarder, et pâle partout où il n'est pas
 * retourné depuis sa dernière session.
 *
 * @a-mesurer choisi sur la cadence de visite attendue, jamais mesuré en partie
 */
export const SURVEY_FADED_HOURS = 24;

/**
 * **En deçà de quoi un second passage n'écrit rien.** Une observation n'écrit que les régions
 * dont le relevé *change* : même tenant et ligne récente, la ligne reste telle quelle. Sans ce
 * frein, une colonne qui fait l'aller-retour à travers un continent réécrit deux fois des
 * centaines de lignes pour la même information.
 *
 * Une heure, soit un vingt-quatrième du délavage : rafraîchir plus finement ne changerait pas
 * d'un cran la teinte à l'écran, ce qui est la seule chose que la date sert à produire.
 *
 * @a-mesurer une fraction lisible de `SURVEY_FADED_HOURS`, rien de plus
 */
export const SURVEY_REFRESH_HOURS = 1;

/**
 * **Au bout de combien de temps un fondateur qui ne revient plus cesse d'être seul à pouvoir
 * clore.** Depuis l'ADR 0020 §9 la Domination est le seul terminateur automatique : un fondateur
 * qui abandonne sans capituler laisse une saison que personne ne peut finir, et le wipe manuel
 * devient le seul recours. Le pouvoir passe donc au doyen des belligérants — pas le titre, la
 * seule exclusivité (`seasons.conclude`).
 *
 * Quarante-huit heures, soit la plus courte des saisons : en deçà, une nuit et une journée de
 * travail suffisent à ouvrir la porte sur un fondateur qui joue encore.
 *
 * @a-mesurer choisi sur la cadence de visite d'un jeu asynchrone, jamais mesuré en partie
 */
export const FOUNDER_ABSENCE_HOURS = 48;

/**
 * **À quelle cadence au plus une présence s'écrit.** Une query ne peut pas écrire, donc la
 * présence est une mutation que le client appelle — et une mutation appelée à chaque
 * rafraîchissement du plateau serait un battement, avec l'invalidation de vue qui va avec.
 *
 * Trente minutes contre quarante-huit heures : la mesure est grossière de deux ordres de
 * grandeur sous le seuil qu'elle sert, ce qui est exactement ce qu'on lui demande.
 */
export const PRESENCE_THROTTLE_MIN = 30;

/**
 * **À partir de quand l'absence du fondateur se dit au plateau.** Une ligne, pas une surface — et
 * elle n'apparaît qu'à l'approche de la porte : afficher « absent depuis 3 h » dès la première
 * matinée ferait d'une absence ordinaire un événement, et de la fenêtre Nation un mouchard sur
 * les habitudes du fondateur.
 */
export const FOUNDER_ABSENCE_NOTICE_HOURS = 24;

/**
 * **À quelle cadence le classement paraît** (décision 80 du 06/09, qui révise les 2 h de la
 * décision 43). C'est la **seule constante nouvelle** que le classement introduit — tout le
 * reste de son barème se lit dans les tables qui existent déjà (`propositions/classement-bareme.md`
 * §1), et une grille de points par bâtiment ou par rôle serait une seconde table d'équilibrage
 * à tenir d'accord avec la première.
 *
 * Trois heures : assez long pour que la page ne soit pas un moniteur — entre deux éditions le
 * classement **ne bouge pas**, et c'est ce qui en fait un rendez-vous — assez court pour qu'une
 * journée de jeu en porte huit. La première paraît à `launchedAt + PRESS_EDITION_HOURS`, jamais
 * au lancement : au lancement il n'y a rien à dire.
 */
export const PRESS_EDITION_HOURS = 3;
