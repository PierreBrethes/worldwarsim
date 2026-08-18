/**
 * The game's identifier vocabulary — stable English ids, shared by the Convex functions and
 * the client. Display names live in `src/i18n/fr.ts`; nothing here is ever shown to a player.
 * This module must stay dependency-free: the Convex bundler imports it through relative paths.
 */

export const NATIONS = [
  'france',
  'uk',
  'usa',
  'ussr',
  'germany',
  'japan',
  'italy',
  'china',
] as const;

export type Nation = (typeof NATIONS)[number];

export const DOCTRINES = ['domination', 'hegemony', 'influence'] as const;

export type Doctrine = (typeof DOCTRINES)[number];

export type UnitRole =
  | 'infantry'
  | 'armor'
  | 'landTransport'
  | 'fighter'
  | 'bomber'
  | 'airTransport'
  | 'escort'
  | 'cargo'
  | 'carrier';

export type UnitTier = 1 | 2;

/**
 * `return` is the only one no player ever orders: a routed column and a column that has fought
 * are put on the road home by the resolution itself, outside the slots. It is a movement all
 * the same — it takes time, it can be seen, and it can be intercepted.
 *
 * `recall` is the opposite exception: the only order a garrison may give, and the only one that
 * spends a slot to walk *away* from the front rather than toward it (question 21, 18/08). An
 * outpost is an address, never a second barracks — it cannot attack, raid or found — so a
 * garrison's whole vocabulary is one word: come home.
 */
export type MovementType = 'attack' | 'raid' | 'outpost' | 'recall' | 'agent' | 'decoy' | 'return';

/**
 * The two season formats. What each one is worth — duration, headquarters at launch, ceiling,
 * foundation, starting alloy — lives in the single table of `convex/constants.ts`; only the
 * name belongs here, beside the rest of the vocabulary.
 */
export type SeasonFormat = 'skirmish' | 'campaign';

/**
 * The eight resources of the economy v2 (ADR 0015). The five first are extracted from a
 * deposit, the three last are transformed from them — one step of chain, never two.
 */
export const RESOURCES = [
  'food',
  'textile',
  'coal',
  'oil',
  'ore',
  'alloy',
  'ammunition',
  'bandages',
] as const;

export type ResourceKey = (typeof RESOURCES)[number];

/**
 * The five map resources of the economy v2 (ADR 0015): what a region can hold, one at most.
 * Baked offline into `public/deposits.json` by `scripts/generate-deposits.mjs` — no game rule
 * derives a deposit at runtime.
 */
export const DEPOSITS = ['food', 'textile', 'coal', 'oil', 'ore'] as const;

export type DepositKey = (typeof DEPOSITS)[number];

/**
 * The buildings of the economy v2 (ADR 0015), in family order: command, exploitation,
 * transformation, projection, intelligence, ceiling, storage. Every one of them sits on a
 * region, and none exists before it is built.
 *
 * There are fifteen. The ADR, the design sheet and the prompt all say "fourteen" and then
 * list these fifteen — the count is the typo, the table is the decision.
 */
export const BUILDINGS = [
  'hq',
  'farm',
  'mill',
  'mine',
  'oilWell',
  'foundry',
  'arsenal',
  'quartermaster',
  'barracks',
  'airfield',
  'port',
  'listening',
  'billets',
  'warehouse',
  'depot',
] as const;

export type BuildingKey = (typeof BUILDINGS)[number];

export type PlayableRegion = 'europe' | 'europe-med' | 'world';

export type RegionType = 'plain' | 'forest' | 'jungle' | 'mountain' | 'desert' | 'tundra';

/**
 * What an outpost is *for*, chosen when it is founded and never changed again (fiche 03).
 *
 * **Extraction is gone** (decision of 18/08): an outpost replaces no building. Extracting
 * abroad is the economy's own buildings (ADR 0015), put up in the reach the outpost opens —
 * counted, capped and lootable like any other, which an outpost was never going to be.
 *
 * The two that remain are shells: their effects wait for the systems that read them, the relay
 * for movement timing and the listening post for the fog. Others are expected — a field
 * pharmacy has been floated — and the union takes them without a migration, which is all they
 * are owed today.
 */
export type Specialization = 'relay' | 'listening';

/** Land, sea, sky — the three environments a route can traverse. */
export type Medium = 'land' | 'sea' | 'air';
