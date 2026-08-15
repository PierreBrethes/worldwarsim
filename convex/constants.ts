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
  Record<'foundry' | 'arsenal' | 'quartermaster', Omit<Conversion, 'perHour'> & { perHourPerLevel: number }>
> = {
  foundry: { output: 'alloy', inputs: [['ore', 2], ['coal', 1]], perHourPerLevel: 4 },
  arsenal: { output: 'ammunition', inputs: [['alloy', 1]], perHourPerLevel: 3 },
  quartermaster: { output: 'bandages', inputs: [['textile', 1]], perHourPerLevel: 3 },
};

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
 * Cost and duration of **a single tier-1 unit**, in alloy. Provisional on two counts: the
 * troops prompt rewrites recruitment on per-building queues, and the men a unit costs are now
 * a ceiling carried by the billets, not a stock to spend. Kept only so the production surface
 * keeps working across the two prompts.
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

export const TIER_2_FACTOR = 1.6;

/**
 * The industrial complex is dissolved (ADR 0015), and research moved to the headquarters
 * along with the movement slots. Tier 2 and the speed of the line follow it there rather than
 * being dropped — a placeholder home, until the troops prompt gives the projection buildings
 * their own queues.
 */
export const TIER_2_HQ_LEVEL = 2;
export const MAX_UNITS_PER_BATCH = 20;
export const MAX_QUEUED_BATCHES = 12;

export function chainSpeed(hqLevel: number): number {
  return 1 + Math.max(0, hqLevel - 1) * 0.225;
}

export function recruitmentCost(role: UnitRole, tier: UnitTier, count: number, hqLevel: number) {
  const base = COST_BY_ROLE[role];
  const factor = tier === 2 ? TIER_2_FACTOR : 1;
  return {
    alloy: Math.round(base.alloy * factor) * count,
    minutes: Math.round((base.minutes * factor * count) / chainSpeed(hqLevel)),
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
