/**
 * Mirror of `convex/constants.ts` and the placement rules of `src/domain/economy.ts`,
 * as of 2026-08-17. **Nothing here is a decision** — every value is copied. When the game's
 * constants move, this file moves with them or the instrument lies.
 *
 * Code is English per ADR 0016. (The older `WWS/simulation/*.mjs` carry French filenames from
 * before that ADR; the refonte should rename them.)
 */

export const RESOURCES = ['food', 'textile', 'coal', 'oil', 'ore', 'alloy', 'ammunition', 'bandages'];

export const EXTRACTION_PER_HOUR = { food: 12, textile: 8, coal: 12, oil: 6, ore: 16 };

export const CHAINS = {
  foundry: { output: 'alloy', inputs: [['ore', 2], ['coal', 1]], perHourPerLevel: 8 },
  arsenal: { output: 'ammunition', inputs: [['alloy', 1]], perHourPerLevel: 3 },
  quartermaster: { output: 'bandages', inputs: [['textile', 1]], perHourPerLevel: 3 },
};

/** An arsenal only runs against a placed lot. Ordering one is a player action, and it is one
 *  of the few the opening offers — the instrument counts it as such. */
export const COMMANDED_CHAINS = new Set(['arsenal']);

export const BASE_CAP = 400;
export const STORAGE_CAP_PER_LEVEL = 600;

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
 * (`plan-progression-v1.md`) — the ground at 1, then the army at 2, sea and air included since
 * the 04/09 (décision 66a: an island has no other way out than the water).
 */
export const UNLOCKED_AT = {
  hq: 1, farm: 1, mill: 1, mine: 1, oilWell: 1, foundry: 1, quartermaster: 1,
  warehouse: 1, depot: 1,
  barracks: 2, billets: 2, arsenal: 2, listening: 2,
  airfield: 2, port: 2,
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

/** One round per five points of engaged strength, per pass — and the pass is the only bill
 *  there is since question 18 (25/08). Mirrored, not used: this engine models no combat. */
export const STRENGTH_PER_ROUND = 5;
export const DRY_AMMUNITION_FACTOR = 0.6;
export const TIER_2_FACTOR = 1.6;
/** Counted above the headquarters the format plants, never in the absolute (ADR 0017). */
export const TIER_2_LEVELS_ABOVE_LAUNCH = 1;
export const MAX_QUEUED_BATCHES = 12;

/**
 * **Le jeu n'a plus de format** (31/08, ADR 0020 §11) : il ne reste qu'une ligne de départ, et ce
 * sont les valeurs de `campaign` — éclatées en `HQ_LEVEL_AT_LAUNCH`, `MAX_HQ_LEVEL`,
 * `STARTING_ALLOY`… dans `convex/constants.ts` — que `verify.mjs` compare, clé par clé.
 * L'escarmouche survit ici comme **scénario de l'instrument** : une ouverture courte qu'on
 * mesure, plus un mode qu'on joue. Rien ne la lit dans le jeu, et `verify.mjs` la déclare non
 * vérifiée plutôt que de la faire passer pour un miroir.
 *
 * Only the entry point into the curve changes: the headquarters at launch, its ceiling, and the
 * alloy of the kit. Rates, chains and bills are shared.
 *
 * **The foundation is no longer here** (25/08): it is read off the nation's ground — see
 * `FOUNDATION_EXTRACTORS` below.
 */
export const HQ_LEVEL_AT_LAUNCH = 1;

export const SEASON_FORMATS = {
  skirmish: {
    defaultDurationHours: 48,
    hqLevelAtLaunch: 2,
    maxHqLevel: 3,
    buildingCapBase: 5,
    buildingCapPerHqLevel: 3,
    startingAlloy: 1000,
    startingOil: 60,
    startingAmmunition: 140,
  },
  campaign: {
    defaultDurationHours: 168,
    hqLevelAtLaunch: HQ_LEVEL_AT_LAUNCH,
    maxHqLevel: 5,
    buildingCapBase: 5,
    buildingCapPerHqLevel: 2,
    startingAlloy: 400,
    startingOil: 40,
    startingAmmunition: 80,
  },
};

/** Everything but the alloy, the oil and the ammunition — the three figures a format sets. */
export const STARTING_STOCK = {
  food: 120, textile: 40, coal: 20, ore: 20, bandages: 0,
};

export const startingStock = (format) => ({
  ...STARTING_STOCK,
  alloy: SEASON_FORMATS[format].startingAlloy,
  oil: SEASON_FORMATS[format].startingOil,
  ammunition: SEASON_FORMATS[format].startingAmmunition,
});

/**
 * Movement and reach. **The engine simulates neither** — the opening it measures is a player
 * clicking on his own ground — so nothing here is read by a scenario. They are mirrored all
 * the same: an unmirrored constant is a constant `verify.mjs` cannot watch drift, and these
 * two are the ones the expansion loop turns on.
 *
 * `MOVEMENTS_IN_FLIGHT` left on 25/08 with the scaffold it was: the ceiling on movements in
 * flight is now `movementSlots(hqLevel)` in `src/domain/movement-orders.ts`, a formula and no
 * longer a number. `verify.mjs` reads scalars as text and cannot watch a formula drift — see
 * the README.
 */
/**
 * **Les emplacements suivent le niveau du site** (ADR 0020 §10) : deux par niveau de QG sur le
 * sol national, son niveau pour un avant-poste, et l'entretien remplace le plafond global comme
 * frein d'expansion. Le moteur ci-dessous ne modélise ni avant-poste ni entretien — ces valeurs
 * sont miroitées pour surveiller leur dérive, pas encore lues par un scénario.
 */
export const PLACEMENTS_PER_HQ_LEVEL = 2;
export const OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL = { food: 2, coal: 1 };

/** Le rayon suit le niveau du point depuis le 31/08 : 400 km couvraient le quart de la France
 *  pour un seul avant-poste de niveau 1. */
export const OUTPOST_REACH_KM_BY_LEVEL = { 1: 120, 2: 180, 3: 240 };
export const MINUTES_PER_1000_KM_ON_LAND = 14;

/**
 * The pace, mirrored on the same terms and from `src/domain/`, where the two of them live: the
 * cost per medium weights the Dijkstra edges and the land seats decide which of the two a column
 * pays. **Unverifiable as before** — the engine routes nothing, so no scenario reads them — but
 * `verify.mjs` watches them drift, and they command the one measured number above.
 */
export const COST_BY_MEDIUM = { land: 1.6, landMotorized: 1.15, sea: 1.0 };
export const LAND_SEATS_PER_TRANSPORT = 2;

export const tier2HqLevel = (format) =>
  SEASON_FORMATS[format].hqLevelAtLaunch + TIER_2_LEVELS_ABOVE_LAUNCH;

/**
 * The tank waits for the level that arms its counter — it **reads the mark-2 threshold**
 * rather than a table of its own, exactly as the game does. The threshold comes in as a number
 * here because a sweep may override it by name in the tuning.
 */
export const roleHqLevel = (role, tier2Level) => (role === 'armor' ? tier2Level : 0);

/**
 * **The foundation is read off the ground** (25/08): one extractor per dry resource the nation's
 * own country holds, and a well only where there is oil. The foundry, the warehouse and the
 * arsenal left the debt and are paid for like anything else — which is exactly what this
 * instrument is meant to price.
 */
export const FOUNDATION_ORDER = ['ore', 'coal', 'food', 'textile', 'oil'];
export const FOUNDATION_EXTRACTORS = {
  ore: 'mine',
  coal: 'mine',
  food: 'farm',
  textile: 'mill',
  oil: 'oilWell',
};

/**
 * A debt is a **couple** (building, deposit): the mine owed for iron is only ever settled by
 * a mine on iron ground (`convex/constants.ts`). A debt whose deposit is `null` — the
 * headquarters, and it alone — is settled wherever it is placed.
 *
 * **Le quartier général ouvre la liste** (décision 1b du 13/09) : il n'est plus planté au
 * lancement, il est la première dette, et comme rien ne se bâtit sans lui l'ordre n'est pas une
 * présentation mais la seule séquence acceptée.
 */
export const foundationFor = (deposits) => [
  { key: 'hq', deposit: null },
  ...FOUNDATION_ORDER.filter((deposit) => deposits.includes(deposit)).map((deposit) => ({
    key: FOUNDATION_EXTRACTORS[deposit],
    deposit,
  })),
];

/** What the foundation still owes, in placement order. */
export function foundationOwed(foundation, standing) {
  const owed = [...foundation];
  for (const held of standing) {
    const rank = owed.findIndex(
      (due) => due.key === held.key && due.deposit === (held.deposit ?? null),
    );
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
  /** Dérivés des tables du miroir, jamais recopiés : sans ça `verify.mjs` peut être vert sur
   *  `CHAINS` et `EXTRACTION_PER_HOUR` pendant qu'un balayage tourne sur les anciens débits. Ce
   *  sont des **valeurs par défaut** — une case de grille les remplace, c'est leur métier. */
  foundryPerHour: CHAINS.foundry.perHourPerLevel,
  orePerHour: EXTRACTION_PER_HOUR.ore,
  coalPerHour: EXTRACTION_PER_HOUR.coal,
  oreInput: CHAINS.foundry.inputs.find(([resource]) => resource === 'ore')[1],
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

/** Only recruitment reads this. `chainsOf` does **not** apply it — the chains run at their
 *  building's level alone, whatever the headquarters. Kept faithful on purpose. */
export const chainSpeed = (hqLevel) => 1 + Math.max(0, hqLevel - 1) * 0.225;

/** Alloy and time, and nothing else: the rounds are billed at the pass now (question 18). */
export const recruitmentCost = (role, tier, hqLevel) => ({
  alloy: Math.round(COST_BY_ROLE[role].alloy * (tier === 2 ? TIER_2_FACTOR : 1)),
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

/** L'ancienne reprojection de `unlockLevel`, gardée pour le scénario d'escarmouche du miroir : le
 *  jeu lit `UNLOCKED_AT` tel quel depuis le 31/08. `UNLOCKED_AT` holds the campaign's levels,
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
