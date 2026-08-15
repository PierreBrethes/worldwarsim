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
  | 'infantry' | 'armor' | 'landTransport'
  | 'fighter' | 'bomber' | 'airTransport'
  | 'escort' | 'cargo' | 'carrier';

export type UnitTier = 1 | 2;

export type MovementType = 'attack' | 'raid' | 'outpost' | 'agent' | 'decoy';

export type ResourceKey = 'supply' | 'steel' | 'manpower';

/**
 * The five map resources of the economy v2 (ADR 0015): what a region can hold, one at most.
 * Baked offline into `public/deposits.json` by `scripts/generate-deposits.mjs` — no game rule
 * derives a deposit at runtime.
 */
export const DEPOSITS = ['food', 'textile', 'coal', 'oil', 'ore'] as const;

export type DepositKey = (typeof DEPOSITS)[number];

export type BuildingKey = 'hq' | 'industry' | 'logistics' | 'conscription' | 'listening';

export type PlayableRegion = 'europe' | 'europe-med' | 'world';

export type RegionType = 'plain' | 'forest' | 'jungle' | 'mountain' | 'desert' | 'tundra';

export type Specialization = 'extraction' | 'relay' | 'listening';

/** Land, sea, sky — the three environments a route can traverse. */
export type Medium = 'land' | 'sea' | 'air';
