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

import type { BuildingKey, DepositKey, ResourceKey, UnitRole } from '../src/domain/ids';
import type { Conversion } from '../src/domain/economy';
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
  foundry: { output: 'alloy', inputs: [['ore', 2], ['coal', 1]], perHourPerLevel: 4 },
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
 * **No game quantity is ever counted in regions. The headquarters is the only bottleneck.**
 * (ADR 0015.) A region is a place, never a counter: Natural Earth cuts the United Kingdom into
 * districts and Germany into Länder — 232 against 16 — so anything indexed on a region count
 * would let a cartography vendor balance a season.
 *
 * Hence a **global** ceiling on standing buildings, carried by the headquarters like the
 * movement slots. It must stay strictly under the region count of the smallest playable nation,
 * or the one-per-region rule would start capping Germany and nobody else — `economy.test.ts`
 * asserts it rather than trusting this paragraph.
 */
export const BUILDING_CAP_BASE = 3;
export const BUILDING_CAP_PER_HQ_LEVEL = 2;

/** Five buildings at the launch, thirteen at the highest headquarters. */
export const buildingCap = (hqLevel: number): number =>
  BUILDING_CAP_BASE + BUILDING_CAP_PER_HQ_LEVEL * hqLevel;

/**
 * The headquarters stops somewhere, otherwise the building ceiling it carries never stops
 * either — and the guard rail above would be unprovable.
 */
export const MAX_HQ_LEVEL = 5;

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
 * Enough to **deploy**, not to settle (fiche 02): a barracks, a farm and a mill, plus an
 * advance of alloy and ammunition for the first light troops. The headquarters is *not* in
 * the list any more — it stands at level 1 from the launch (ADR 0015), so the kit no longer
 * carries its 60 alloy and 40 coal.
 */
export const STARTING_STOCK: Readonly<Record<ResourceKey, number>> = {
  food: 120,
  textile: 40,
  coal: 20,
  oil: 0,
  ore: 20,
  alloy: 100,
  ammunition: 40,
  bandages: 0,
};

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
 * The ammunition a troop leaves with, **derived** rather than tabulated: the chiffrage spends
 * one round per five points of strength and per engagement (§5), so a fresh troop carries two
 * engagements' worth. Nine hand-written numbers would be nine chances to contradict that rule.
 *
 * This is the initial load only. Neither upkeep nor continuous consumption is coded — no rate
 * is figured anywhere, and `economyOf` has no path for a stock that drains.
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
 */
export const TIER_2_HQ_LEVEL = 2;

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

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_LAUNCH = 2;

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
