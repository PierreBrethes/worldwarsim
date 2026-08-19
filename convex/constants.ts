/**
 * **Every number in this file is a placeholder.** Extraction rates, conversion ratios,
 * building costs, storage ceilings, the starting kit: none of it has been simulated, and the
 * simulation report calibrated on three resources (ADR 0015) does not carry over. This is the
 * one place to correct when the simulator takes over — nothing numeric belongs anywhere else.
 *
 * Orders of magnitude were chosen so that a fresh nation can raise its first buildings within
 * the first hours of a 48-hour season, and so that a foundry is worth more than the ore it
 * eats. Nothing more was measured.
 */

import type {
  BuildingKey,
  DepositKey,
  ResourceKey,
  SeasonFormat,
  UnitRole,
} from '../src/domain/ids';
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
 * **A chain runs on its own as long as its input serves nothing else. The moment it eats a
 * matter spent elsewhere, the player says how much.** The alloy pays for buildings, for
 * upgrades and for troops, so an arsenal at level 3 quietly takes 216 a day from a nation
 * saving 430 for a carrier — a defect nobody can see, since no screen ever names it.
 *
 * Written down rather than derived from the cost tables: coal appears in half the building
 * bills without anyone thinking of the foundry as commanded, so a derivation would command
 * every chain and the decision would stop being one. Extending it is an edit here, which is
 * exactly what the rule wants — the day textile is spent elsewhere, the quartermaster joins
 * the list and nothing else moves.
 */
export const COMMANDED_CHAINS: ReadonlyArray<ChainKey> = ['arsenal'];

export const isCommanded = (key: BuildingKey): boolean =>
  (COMMANDED_CHAINS as ReadonlyArray<string>).includes(key);

/**
 * Low by default, so the warehouse and the depot become necessary — and therefore targets,
 * which is the point (fiche 02). Each storage building raises its own half.
 */
export const BASE_CAP = 400;
export const STORAGE_CAP_PER_LEVEL = 600;

export const STORED_BY: Readonly<Record<'warehouse' | 'depot', ReadonlyArray<ResourceKey>>> = {
  warehouse: ['food', 'textile', 'coal', 'ore', 'alloy', 'bandages'],
  depot: ['oil', 'ammunition'],
};

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
  depot: { cost: { alloy: 40, coal: 15 }, minutes: 30 },
};

/**
 * **One headquarters level, one new question** (`plan-progression-v1.md`). The catalogue opens
 * in three steps and each one changes the *nature* of the season rather than its volume: the
 * ground at 1, the army and the ear at 2, projection at 3. A step that only adds more of the
 * same is a step nobody notices.
 *
 * Exhaustive by type: dropping a key breaks the build rather than quietly unlocking it at zero.
 * It is the **only** prerequisite a building has — no chain of one building requiring another,
 * ADR 0015 keeps the headquarters as the single bottleneck.
 *
 * **The warehouse and the depot stay at 1, and that is not a rounding.** Storage is what
 * protects the absent player (the ceiling bites hardest on whoever cannot come back to spend),
 * so raising it would punish exactly the one who can do nothing about it.
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
  airfield: 3,
  port: 3,
};

/**
 * **`unlockLevel` says what a format makes reachable; `tier2HqLevel` says when progression
 * crosses a step. They are opposites on purpose and must never be merged** — a width against a
 * depth. A short format has to open its catalogue *early*, or the steps it never climbs are
 * simply lines it never sees; and it has to keep its mark-2 step *ahead*, or raising the
 * headquarters rewards nothing. Somebody will try to unify them; this paragraph is why not.
 *
 * `UNLOCKED_AT` holds the campaign's levels — the reference format, whose run goes from a
 * headquarters of 1 to 5 — and every other format reprojects them onto its own run as a
 * fraction of the way through. In a campaign it is the identity.
 *
 * A skirmish's run is **one single step**, so everything lands on its launch: the port and the
 * aerodrome are there from the first minute. That is the answer, not a side effect — a
 * catalogue tiered over a single step tiers nothing, it only delays. What paces a skirmish is
 * alloy and time, never the headquarters.
 */
export function unlockLevel(key: BuildingKey, format: SeasonFormat): number {
  const reference = SEASON_FORMATS.campaign;
  const spec = SEASON_FORMATS[format];
  const referenceRun = reference.maxHqLevel - reference.hqLevelAtLaunch;
  const advance = (UNLOCKED_AT[key] - reference.hqLevelAtLaunch) / referenceRun;
  return spec.hqLevelAtLaunch + Math.floor(advance * (spec.maxHqLevel - spec.hqLevelAtLaunch));
}

/**
 * **No game quantity is ever counted in regions. The headquarters is the only bottleneck.**
 * (ADR 0015.) A region is a place, never a counter: Natural Earth cuts the United Kingdom into
 * districts and Germany into Länder — 232 against 16 — so anything indexed on a region count
 * would let a cartography vendor balance a season.
 *
 * Hence a ceiling on standing buildings carried by the headquarters, like the movement slots.
 * **The ladder belongs to the format**, not to the game: written globally it read the same at
 * a headquarters of 2 whether that was a skirmish's launch or a campaign's second step, and a
 * skirmish came out with *zero* free placement at launch and one for the whole season — the
 * foundation and the headquarters ate the seven. ADR 0017 had set the appointment: it held
 * only because recruitment filled the hole, and it was to be looked at when movements existed.
 *
 * Whatever the format, the ceiling must stay strictly under the region count of the smallest
 * playable nation, or the one-per-region rule would start capping Germany and nobody else —
 * `economy.test.ts` asserts it on every format rather than trusting this paragraph.
 */
export const buildingCap = (format: SeasonFormat, hqLevel: number): number => {
  const spec = SEASON_FORMATS[format];
  return spec.buildingCapBase + spec.buildingCapPerHqLevel * hqLevel;
};

export type SeasonFormatSpec = {
  readonly durationHours: number;
  /** Where the headquarters stands from the first minute (ADR 0015). */
  readonly hqLevelAtLaunch: number;
  readonly maxHqLevel: number;
  /**
   * The building ceiling this format's headquarters carries, as a base and a step. What these
   * two describe is not the ceiling but **the free placements left once the foundation and the
   * headquarters are standing** — four at a skirmish's launch and seven at its end, one at a
   * campaign's launch and nine at its end. A format that opens on a fat foundation has to
   * carry a wider ladder for the same room to choose.
   */
  readonly buildingCapBase: number;
  readonly buildingCapPerHqLevel: number;
  /**
   * The buildings the season starts *owing* the player. Ordered, with repetitions: two mines
   * are two placements, and which deposit each one works is the player's to choose.
   */
  readonly foundation: ReadonlyArray<BuildingKey>;
  /**
   * **Measured, not chosen** (`node WWS/simulation/opening/run.mjs --sweep`, assiduous player).
   * Over 48 hours: 800 gives 24 actions, 1000 gives 30, 1300 gives 34 and 1800 gives 34 too —
   * past 1300 the troop ceiling answers, not the kit. The campaign is measured on the same
   * yardstick over its own first 48 hours, where 500 is where the empty connections stop
   * falling.
   *
   * **Fragile, and knowingly so**: the curve is not monotonic in places (the campaign takes 26
   * actions at 350 and 28 at 800), because there the order of the clicks weighs more than the
   * parameters do. That is a symptom, never a knob.
   */
  readonly startingAlloy: number;
  /**
   * **The fuse.** Oil is the one resource a nation can be born unable to make: the deposit
   * script says so of Japan outright. This reserve is what pays the *first journey towards*
   * oil — the column that walks to a well abroad and the outpost that opens the ground to
   * build it on — and the fact that it runs out is the engine of the nations that lack it.
   *
   * A placeholder like everything here, and short-lived as a *quantity*: the day
   * `consommation-continue.md` makes the motorised drink, this stops being a stock and becomes
   * a dated fuse. **It will then have to be sized in journeys, never in litres.**
   *
   * No table per nation, deliberately: one number per format. The asymmetry comes from the map
   * — the nations with oil replenish, the others live on the reserve — and eight hand-written
   * values would be eight more numbers to balance for an effect geography gives away free.
   */
  readonly startingOil: number;
};

/**
 * **Two formats, one economy.** Extraction rates, chains and bills are the same in both: what a
 * format changes is *where a player enters the curve*, never its slope. Stretching the season
 * does not stretch the night, and the seven-hour rest window (design sheet 07) would turn
 * absurd if a longer format ran a faster economy.
 *
 * Everything that differs is in this table and nowhere else. A second extraction rate or a
 * second cost appearing beside a format key means the wrong road was taken.
 */
export const SEASON_FORMATS: Readonly<Record<SeasonFormat, SeasonFormatSpec>> = {
  skirmish: {
    durationHours: 48,
    hqLevelAtLaunch: 2,
    maxHqLevel: 3,
    buildingCapBase: 5,
    buildingCapPerHqLevel: 3,
    foundation: ['mine', 'mine', 'foundry', 'warehouse', 'farm', 'arsenal'],
    startingAlloy: 1000,
    startingOil: 60,
  },
  campaign: {
    durationHours: 168,
    hqLevelAtLaunch: 1,
    maxHqLevel: 5,
    buildingCapBase: 3,
    buildingCapPerHqLevel: 2,
    foundation: ['mine', 'mine', 'foundry'],
    startingAlloy: 500,
    startingOil: 40,
  },
};

export function formatOf(durationHours: number): SeasonFormat {
  const found = (Object.keys(SEASON_FORMATS) as ReadonlyArray<SeasonFormat>).find(
    (key) => SEASON_FORMATS[key].durationHours === durationHours,
  );
  if (found === undefined) throw new Error(`no season format lasting ${durationHours} h`);
  return found;
}

/**
 * What the foundation still owes, in placement order. A key held on several regions consumes
 * one debt each time, so the two mines of the table are two free placements and the third is
 * paid for like anything else.
 */
export function foundationOwed(
  format: SeasonFormat,
  standing: ReadonlyArray<BuildingKey>,
): ReadonlyArray<BuildingKey> {
  const owed = [...SEASON_FORMATS[format].foundation];
  for (const key of standing) {
    const rank = owed.indexOf(key);
    if (rank >= 0) owed.splice(rank, 1);
  }
  return owed;
}

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
 * Enough to **deploy**, not to settle (fiche 02): an advance of matter for the first hours.
 * The headquarters is *not* in the list — it stands from the launch (ADR 0015), at the level
 * its format says.
 *
 * **The alloy and the oil are missing here on purpose**: they are the two figures a format
 * sets — the alloy decides where a player enters the curve, the oil how far the first journey
 * can go. Everything else is shared, and a second copy of it under a format key would be the
 * doubling the table exists to avoid.
 */
export const STARTING_STOCK: Readonly<Record<Exclude<ResourceKey, 'alloy' | 'oil'>, number>> = {
  food: 120,
  textile: 40,
  coal: 20,
  ore: 20,
  ammunition: 40,
  bandages: 0,
};

export const startingStock = (format: SeasonFormat): Readonly<Record<ResourceKey, number>> => ({
  ...STARTING_STOCK,
  alloy: SEASON_FORMATS[format].startingAlloy,
  oil: SEASON_FORMATS[format].startingOil,
});

/**
 * **The hit points of a troop are its readable strength** (ADR 0014), reported straight from
 * `chiffrage-combat.md` §1 — 50 soldiers, 12 tanks, 6 ships. The carrier counts its air group,
 * not its hulls: a carrier at one hit point dies at a stroke and reads as nothing.
 *
 * Absent means the tier does not exist for that role; `TIERS_BY_ROLE` says the same thing and
 * `troops.test.ts` holds the two together rather than trusting them to stay in step.
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
 * The ammunition a troop costs to recruit, **derived** rather than tabulated: the chiffrage
 * prices one round per five points of strength and per engagement (§5), so a fresh troop bills
 * two engagements' worth up front. Nine hand-written numbers would be nine chances to
 * contradict that rule.
 *
 * **This is the only facturation** (question 18): combat itself never debits ammunition — a
 * troop that already paid to be formed does not pay again to fight. Billing both ends was the
 * bug; one billing, at recruitment, is the fix.
 */
export const INITIAL_AMMUNITION_ENGAGEMENTS = 2;
export const STRENGTH_PER_ROUND = 5;

export const ammunitionLoad = (role: UnitRole, tier: UnitTier): number =>
  Math.ceil(nominalStrength(role, tier) / STRENGTH_PER_ROUND) * INITIAL_AMMUNITION_ENGAGEMENTS;

export const TIER_2_FACTOR = 1.6;

/**
 * Research lives at the headquarters since the industrial complex was dissolved (ADR 0015).
 * The tier-2 gate and the speed of the line stay there and do **not** migrate onto the
 * projection buildings, which only carry their own queue.
 *
 * **The gate is counted above the launch, never in the absolute** (ADR 0017). Written as an
 * absolute 2, it opened mark 2 in the first minute of a skirmish, whose format plants the
 * headquarters at 2 — a step that does not exist is not a step. One constant, one threshold
 * derived per format: two thresholds written by hand would drift the day a format moves its
 * launch.
 *
 * **This is a depth, and `unlockLevel` is a width — do not merge them.** The catalogue has to
 * open early in a short format; this step has to stay ahead of the player in one, or climbing
 * buys nothing. See the paragraph above `unlockLevel`.
 */
export const TIER_2_LEVELS_ABOVE_LAUNCH = 1;

export const tier2HqLevel = (format: SeasonFormat): number =>
  SEASON_FORMATS[format].hqLevelAtLaunch + TIER_2_LEVELS_ABOVE_LAUNCH;

/**
 * **The weapon and its counter arrive together** (`plan-progression-v1.md`, question 6c). Armor
 * leaves the launch of a skirmish for the level that opens mark 2: the damage table makes
 * mark-2 infantry the answer to a tank (.65/.45 against .15/.05), so opening the tank first
 * would hand out thirty-three hours of unanswerable armor.
 *
 * It **reads the mark-2 threshold** rather than holding a table of its own — one number moves
 * both, which is precisely the decision. Every other role is carried by its projection
 * building, and `UNLOCKED_AT` locks those; zero here means "nothing above the building".
 */
export const roleHqLevel = (role: UnitRole, format: SeasonFormat): number =>
  role === 'armor' ? tier2HqLevel(format) : 0;

/**
 * The length of one **building's** queue. Nearly inert since a batch became a single troop:
 * the troop ceiling below bites long before twelve batches pile up in a single barracks. Kept
 * as a guard against an unbounded queue, not as a balance knob.
 */
export const MAX_QUEUED_BATCHES = 12;

/**
 * **One ceiling, and it counts troops — never men.** Adding the nominal strengths would add
 * tanks to destroyers: 50 soldiers, 12 tanks and 6 ships are not the same unit of measure.
 *
 * The step is **derived**: moving `TROOP_CAP_TARGET` alone moves the ceiling, which is what
 * lets the simulator sweep it without a second number to fix by hand.
 *
 * **Assumed: this is an anti-swarm rule, not a balance between domains.** A ceiling counted in
 * troops only bites on the cheap roles — 24 infantries cost 432 alloy, 24 carriers would cost
 * 10 320, so the ceiling speaks for the infantry and the cost speaks for the navy. Without it
 * a single barracks turns out some 500 infantries over a seven-day season. Making it bite
 * everywhere would take a per-role price in "slots" — one more table to balance, refused on
 * purpose. Do not "fix" this.
 *
 * There is no per-domain ceiling either: land, air and sea draw on the same stock, exactly as
 * the movement slots do (ADR 0006). That is what gives the choice of doctrine its weight.
 */
export const TROOP_CAP_BASE = 8;
export const TROOP_CAP_TARGET = 24;
export const BILLETS_LEVELS_TO_CAP = 8;

export const TROOP_CAP_PER_BILLETS_LEVEL =
  (TROOP_CAP_TARGET - TROOP_CAP_BASE) / BILLETS_LEVELS_TO_CAP;

/**
 * The ceiling reads the **sum of the levels of every billets** — a ceiling adds up over sites,
 * where the headquarters cap and the tier gates read the best instance alone.
 *
 * **The second billets is a compulsory toll, and that is the decision.** `cappedByHq` forbids
 * any building from reaching the headquarters' level, so a billets stops at 4 under a
 * headquarters at 5: **one billets caps a nation at 16 troops** and can never saturate.
 * Reaching 24 costs at least **two building slots** out of the thirteen the headquarters
 * carries — a full army is paid for in economy. Each extra site saves matter (2×4: 594 alloy,
 * 4×2: 280), so the trade reads plainly and hides no optimum.
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
    ammunition: ammunitionLoad(role, tier),
    minutes: Math.round((base.minutes * factor) / chainSpeed(hqLevel)),
  };
}

/**
 * **The damage table of `chiffrage-combat.md` §2, copied literally.** The value is the share of
 * the defender's nominal strength that a full-strength attacker destroys in one pass, before
 * modifiers; a **missing** cell is "cannot reach", never a zero — seventy-five reachable couples
 * out of a hundred and twenty-one.
 *
 * Not a knob. These figures exist to be *measured as they stand*: `combat.test.ts` replays the
 * seventy-five couples and fails the suite on an absolute counter or an unintended null riposte,
 * exactly as `WWS/simulation/verif-chiffrage.mjs` used to on a copy of them.
 *
 * Three deliberate departures from design sheet 08 are baked in and must survive any edit: the
 * token anti-air value of mark-2 infantry (.06 to .12, so a pure air force pays *something*),
 * the fighter as the only answer to the bomber, and the carrier's mediocre line — its strength
 * is reach, not power.
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
 * The modifiers of `chiffrage-combat.md` §4 that a rule may read **today**. Two of the five are
 * missing on purpose:
 *
 * - **the terrain**, because `RegionType` is a stand-in — six regions classified by hand and a
 *   hash of the name for the rest — and `CLAUDE.md` forbids a game rule from reading it without
 *   its own ADR. A terrain modifier would multiply noise;
 * - **the pincer** (×1.20), because "two converging movements" has no definition yet: how close
 *   in time, how wide an angle, measured where. It is one number and three decisions, and
 *   improvising it here would settle them by accident.
 */
export const DEFENDER_BONUS = 1.15;
export const ROUT_THRESHOLD = 0.25;

export const COMBAT_RULES: CombatRules = {
  damage: DAMAGE_TABLE,
  defenderBonus: DEFENDER_BONUS,
  routThreshold: ROUT_THRESHOLD,
};

/**
 * **The most gaping hole in the model, and it is not simulated** (design sheet 08 §11). Every
 * force — marching or garrisoning — carries this radius, and an opposing movement that crosses
 * it is brought to contact. Too wide and nothing ever gets through: the map freezes and the
 * game stops being about projection. Too narrow and interception, the first of the three
 * counter-powers ADR 0014 demands against the attacker's initiative, never fires.
 *
 * Two hundred kilometres is a **placeholder with no measurement behind it whatsoever** — it is
 * roughly a quarter of an hour of marching at the measured pace, which is the only thing that
 * can be said for it. The simulator does not model interception; this number will have to be
 * settled by hand, and it is the first thing the first campaign must look at.
 */
export const INTERCEPTION_RADIUS_KM = 200;

/**
 * **How close one has to stand to be found on arrival.** A march aimed at a point resolves
 * against what holds ground within this radius — troops posted on the map, the garrison of an
 * outpost, the troops hanging from a building whose region answers by its own point. It is what
 * replaces the containment the server cannot compute: it holds no polygons, and asking which
 * region encloses a coordinate has no answer here (ADR 0019 §1).
 *
 * Twenty-five kilometres is **an assumed starting point, never measured** — the same status as
 * `INTERCEPTION_RADIUS_KM`, and deliberately not the same value. One does not arrive two hundred
 * kilometres from one's target: an interception is a net cast across a road, an arrival is a
 * place one walked to. Wider, aiming would stop being a gesture that says anything; narrower,
 * the point one clicks would have to land on a defender to find him.
 */
export const ARRIVAL_RADIUS_KM = 25;

/**
 * How long a raid keeps an outpost deactivated, and how long it may not be raided again after
 * that (design sheet 03). **Neither figure is in the design** — the sheet says "temporarily"
 * and "then an immunity window", and stops there. Both are placeholders shaped only so the pair
 * reads: a night out of service, half a night of respite, on a 48-hour season.
 *
 * The immunity is what keeps the rule from collapsing into a permanent shutdown by relays of
 * cheap raids — without it, deactivation is destruction with extra steps, and destruction is
 * explicitly not on the table until looting exists.
 */
export const OUTPOST_DISABLED_HOURS = 6;
export const OUTPOST_IMMUNITY_HOURS = 3;

/**
 * **How far an outpost opens the ground around it**, in kilometres (ADR 0015). A placeholder
 * like the rest, and the only shape the rule may take: no quantity is counted in regions, so
 * the reach is a radius. Four hundred kilometres is a handful of Romanian counties, one
 * Australian state and no French department at all — the effect is "a few regions around", the
 * count is the geography's business.
 */
export const OUTPOST_REACH_KM = 400;

/**
 * **The one measured number of movement**, straight out of the simulation report: 14 minutes
 * per 1 000 km, on land, the lever the whole game turns on. Everything else about a duration
 * is derived from it — a route already carries its cost in sea-equivalent units (ADR 0012:
 * land ×1.6, transfers +8), so the minute price of one cost unit is that measurement read
 * back through the land multiplier. Writing the two numbers by hand would let them drift, and
 * a drift here moves every trip in the game.
 */
export const MINUTES_PER_1000_KM_ON_LAND = 14;

export const MINUTES_PER_ROUTE_UNIT =
  (MINUTES_PER_1000_KM_ON_LAND * KM_PER_UNIT) / (1000 * COST_BY_MEDIUM.land);

export const routeMinutes = (costUnits: number): number =>
  Math.max(1, Math.round(costUnits * MINUTES_PER_ROUTE_UNIT));

/**
 * **One movement in flight per player, in the meantime.** The regulator of ADR 0006 is the
 * movement slot, carried by a building that the economy v2 dissolved — until it is re-hung
 * somewhere, this stands in its place: a single constraint that bounds the fan-out and
 * prejudges nothing about the slots to come. It is a placeholder, not a decision.
 */
export const MOVEMENTS_IN_FLIGHT = 1;

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_LAUNCH = 2;

/**
 * **The bar of the test victory** (`src/domain/victory.ts`): a player is reduced when his
 * standing capacity falls under this share of the nominal it was formed at. A placeholder like
 * every other number of the game that has not been simulated — and it goes with the scaffold it
 * serves, the day the doctrines of design sheet 05 land.
 */
export const REDUCTION_FACTOR = 0.5;

/**
 * Seven hours per 24, per design sheet 07. The duration is **fixed, not chosen**: the window
 * forbids any arrival while it lasts, so letting a player set its length would let him set
 * how long he is untouchable — and a 23-hour window is a permanent shield. He picks when he
 * sleeps, never how long.
 */
export const REST_WINDOW_MINUTES = 7 * 60;
export const DEFAULT_REST_START_MINUTES = 23 * 60;

export const restWindowFrom = (startMinutes: number) => ({
  startMinutes,
  endMinutes: (startMinutes + REST_WINDOW_MINUTES) % 1440,
});

export const DEFAULT_REST_WINDOW = restWindowFrom(DEFAULT_REST_START_MINUTES);
