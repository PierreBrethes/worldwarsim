/**
 * Mirror of `convex/constants.ts` and the placement rules of `src/domain/economy.ts`,
 * as of 2026-08-17. **Nothing here is a decision** — every value is copied. When the game's
 * constants move, this file moves with them or the instrument lies.
 *
 * Code is English per ADR 0016. (The older `WWS/simulation/*.mjs` carry French filenames from
 * before that ADR; the refonte should rename them.)
 */

export const RESOURCES = ['food', 'textile', 'coal', 'oil', 'ore', 'alloy', 'ammunition', 'bandages'];

export const EXTRACTION_PER_HOUR = { food: 12, textile: 8, coal: 10, oil: 6, ore: 9 };

export const CHAINS = {
  foundry: { output: 'alloy', inputs: [['ore', 2], ['coal', 1]], perHourPerLevel: 4 },
  arsenal: { output: 'ammunition', inputs: [['alloy', 1]], perHourPerLevel: 3 },
  quartermaster: { output: 'bandages', inputs: [['textile', 1]], perHourPerLevel: 3 },
};

/** An arsenal only runs against a placed lot. Ordering one is a player action, and it is one
 *  of the few the opening offers — the instrument counts it as such. */
export const COMMANDED_CHAINS = new Set(['arsenal']);

export const BASE_CAP = 400;
export const STORAGE_CAP_PER_LEVEL = 600;
export const STORED_BY = {
  warehouse: ['food', 'textile', 'coal', 'ore', 'alloy', 'bandages'],
  depot: ['oil', 'ammunition'],
};

export const BUILDING_SPEC = {
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
 * The catalogue by tier: which headquarters level opens each key. One level, one new question
 * (`plan-progression-v1.md`) — the ground at 1, the army and the ear at 2, projection at 3.
 */
export const UNLOCKED_AT = {
  hq: 1, farm: 1, mill: 1, mine: 1, oilWell: 1, foundry: 1, quartermaster: 1,
  warehouse: 1, depot: 1,
  barracks: 2, billets: 2, arsenal: 2, listening: 2,
  airfield: 3, port: 3,
};

/** Which deposit an exploitation building works. The mine works two. */
export const EXPLOITED_DEPOSITS = {
  farm: ['food'], mill: ['textile'], mine: ['coal', 'ore'], oilWell: ['oil'],
};

export const PROJECTION_BY_DOMAIN = { land: 'barracks', air: 'airfield', sea: 'port' };
export const DOMAIN_BY_ROLE = {
  infantry: 'land', armor: 'land', landTransport: 'land',
  fighter: 'air', bomber: 'air', airTransport: 'air',
  escort: 'sea', cargo: 'sea', carrier: 'sea',
};

export const NOMINAL_STRENGTH = {
  infantry: { 1: 50, 2: 30 }, armor: { 1: 12, 2: 6 }, landTransport: { 1: 24 },
  fighter: { 1: 12 }, bomber: { 1: 9 }, airTransport: { 1: 6 },
  escort: { 1: 6 }, cargo: { 1: 8 }, carrier: { 1: 24 },
};

export const COST_BY_ROLE = {
  infantry: { alloy: 18, minutes: 20 }, armor: { alloy: 95, minutes: 70 },
  landTransport: { alloy: 40, minutes: 45 }, fighter: { alloy: 110, minutes: 90 },
  bomber: { alloy: 160, minutes: 120 }, airTransport: { alloy: 90, minutes: 75 },
  escort: { alloy: 175, minutes: 180 }, cargo: { alloy: 120, minutes: 100 },
  carrier: { alloy: 430, minutes: 480 },
};

export const INITIAL_AMMUNITION_ENGAGEMENTS = 2;
export const STRENGTH_PER_ROUND = 5;
export const TIER_2_FACTOR = 1.6;
/** Counted above the headquarters the format plants, never in the absolute (ADR 0017). */
export const TIER_2_LEVELS_ABOVE_LAUNCH = 1;
export const MAX_QUEUED_BATCHES = 12;

/**
 * The two formats, mirrored key for key. Only the entry point into the curve changes: the
 * headquarters at launch, its ceiling, the foundation the season owes, and the alloy of the
 * kit. Rates, chains and bills are shared, and a second copy of one under a format key would
 * be exactly the mistake the table exists to prevent.
 */
export const SEASON_FORMATS = {
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

/** Everything but the alloy and the oil, the two figures a format sets. */
export const STARTING_STOCK = {
  food: 120, textile: 40, coal: 20, ore: 20, ammunition: 40, bandages: 0,
};

export const startingStock = (format) => ({
  ...STARTING_STOCK,
  alloy: SEASON_FORMATS[format].startingAlloy,
  oil: SEASON_FORMATS[format].startingOil,
});

/**
 * Movement and reach. **The engine simulates neither** — the opening it measures is a player
 * clicking on his own ground — so nothing here is read by a scenario. They are mirrored all
 * the same: an unmirrored constant is a constant `verify.mjs` cannot watch drift, and these
 * two are the ones the expansion loop turns on.
 */
export const OUTPOST_REACH_KM = 400;
export const MINUTES_PER_1000_KM_ON_LAND = 14;
export const MOVEMENTS_IN_FLIGHT = 1;

export const tier2HqLevel = (format) =>
  SEASON_FORMATS[format].hqLevelAtLaunch + TIER_2_LEVELS_ABOVE_LAUNCH;

/**
 * The tank waits for the level that arms its counter — it **reads the mark-2 threshold**
 * rather than a table of its own, exactly as the game does. The threshold comes in as a number
 * here because a sweep may override it by name in the tuning.
 */
export const roleHqLevel = (role, tier2Level) => (role === 'armor' ? tier2Level : 0);

/** What the foundation still owes, in placement order. */
export function foundationOwed(foundation, standing) {
  const owed = [...foundation];
  for (const key of standing) {
    const rank = owed.indexOf(key);
    if (rank >= 0) owed.splice(rank, 1);
  }
  return owed;
}

export const TROOP_CAP_BASE = 8;
export const TROOP_CAP_TARGET = 24;
export const BILLETS_LEVELS_TO_CAP = 8;
export const TROOP_CAP_PER_BILLETS_LEVEL =
  (TROOP_CAP_TARGET - TROOP_CAP_BASE) / BILLETS_LEVELS_TO_CAP;

export const REST_WINDOW_MINUTES = 7 * 60;

/** La barre de la victoire de test — échafaudage, remplacé par les doctrines de la fiche 05. */
export const REDUCTION_FACTOR = 0.5;

/**
 * Tunables. Everything a sweep is allowed to move lives here and nowhere else, so a scenario
 * file never hides a second copy of a number.
 */
export const DEFAULT_TUNING = {
  levelCostFactor: 1.8,
  foundryPerHour: 4,
  orePerHour: 9,
  coalPerHour: 10,
  oreInput: 2,
  // The building ceiling belongs to the format now (`SEASON_FORMATS`), and `scenarios.mjs`
  // overrides these two from it. Kept so a bare scenario still has a ceiling, and so a sweep
  // can still ask what widening it buys. The instrument mirrors, it does not propose.
  buildingCapBase: 3,
  buildingCapPerHqLevel: 2,
  /** Overridden by the season's format; kept so a bare scenario still has a ceiling. */
  maxHqLevel: 5,
  /** Same: the format's own threshold overrides it (`tier2HqLevel`). */
  tier2HqLevel: 2,
  troopCapTarget: TROOP_CAP_TARGET,
};

export const nominalStrength = (role, tier) => {
  const s = NOMINAL_STRENGTH[role][tier];
  if (s === undefined) throw new Error(`no tier ${tier} for ${role}`);
  return s;
};

export const ammunitionLoad = (role, tier) =>
  Math.ceil(nominalStrength(role, tier) / STRENGTH_PER_ROUND) * INITIAL_AMMUNITION_ENGAGEMENTS;

/** Only recruitment reads this. `chainsOf` does **not** apply it — the chains run at their
 *  building's level alone, whatever the headquarters. Kept faithful on purpose. */
export const chainSpeed = (hqLevel) => 1 + Math.max(0, hqLevel - 1) * 0.225;

export const recruitmentCost = (role, tier, hqLevel) => ({
  alloy: Math.round(COST_BY_ROLE[role].alloy * (tier === 2 ? TIER_2_FACTOR : 1)),
  ammunition: ammunitionLoad(role, tier),
  minutes: Math.round((COST_BY_ROLE[role].minutes * (tier === 2 ? TIER_2_FACTOR : 1)) / chainSpeed(hqLevel)),
});

/** `target` is tunable so the sweep can ask what a 48-hour season can actually field.
 *  The step is derived from it, exactly as `constants.ts` derives it — one number moves. */
export const troopCap = (billetsTotalLevel, target = TROOP_CAP_TARGET) =>
  Math.min(target, Math.floor(TROOP_CAP_BASE + ((target - TROOP_CAP_BASE) / BILLETS_LEVELS_TO_CAP) * billetsTotalLevel));

export const buildCost = (key, level, tuning) => {
  const f = tuning.levelCostFactor ** (level - 1);
  return Object.fromEntries(
    Object.entries(BUILDING_SPEC[key].cost).map(([r, a]) => [r, Math.round(a * f)]),
  );
};

export const buildMinutes = (key, level, tuning) =>
  Math.round(BUILDING_SPEC[key].minutes * tuning.levelCostFactor ** (level - 1));

/** Mirrors `unlockLevel` in `convex/constants.ts`: `UNLOCKED_AT` holds the campaign's levels,
 *  every other format reprojects them onto its own run. A skirmish's run is one step, so its
 *  whole catalogue opens at the launch. */
export const unlockLevel = (key, format) => {
  const ref = SEASON_FORMATS.campaign;
  const spec = SEASON_FORMATS[format];
  const advance = (UNLOCKED_AT[key] - ref.hqLevelAtLaunch) / (ref.maxHqLevel - ref.hqLevelAtLaunch);
  return spec.hqLevelAtLaunch + Math.floor(advance * (spec.maxHqLevel - spec.hqLevelAtLaunch));
};

export const buildingCap = (hqLevel, tuning) =>
  Math.floor(tuning.buildingCapBase + tuning.buildingCapPerHqLevel * hqLevel);

export const extractionPerHour = (deposit, tuning) => {
  if (deposit === 'ore') return tuning.orePerHour;
  if (deposit === 'coal') return tuning.coalPerHour;
  return EXTRACTION_PER_HOUR[deposit];
};

export const chainInputs = (key, tuning) =>
  key === 'foundry' ? [['ore', tuning.oreInput], ['coal', 1]] : CHAINS[key].inputs;

export const chainPerHourPerLevel = (key, tuning) =>
  key === 'foundry' ? tuning.foundryPerHour : CHAINS[key].perHourPerLevel;
