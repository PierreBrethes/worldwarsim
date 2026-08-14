// Balancing placeholders, to be run through the simulator before any real season.
// Sources: design sheet 02 for the structure, WWS/simulation for the orders of magnitude.

import type { UnitRole } from '../src/domain/ids';
import type { UnitTier } from '../src/domain/troops';

export { NATIONS } from '../src/domain/ids';

export const STARTING = {
  supply: { stock: 500, ratePerHour: 120 },
  steel: { stock: 0, ratePerHour: 0 },
  manpower: { stock: 60, ratePerHour: 8, cap: 120 },
} as const;

/**
 * Cost and duration of **a single tier-1 unit**. Steel and manpower come from the
 * `catalogueProduction` of `WWS/simulation/etat-reference.json`, durations from mockup 4.6 —
 * a unit is bought with steel and men, **never with supply**. Values assumed arbitrary until
 * the simulator: this is the only place to correct.
 */
export const COST_BY_ROLE: Readonly<
  Record<UnitRole, { manpower: number; supply: number; steel: number; minutes: number }>
> = {
  infantry: { manpower: 6, supply: 0, steel: 18, minutes: 20 },
  armor: { manpower: 3, supply: 0, steel: 95, minutes: 70 },
  landTransport: { manpower: 2, supply: 0, steel: 40, minutes: 45 },
  fighter: { manpower: 2, supply: 0, steel: 110, minutes: 90 },
  bomber: { manpower: 3, supply: 0, steel: 160, minutes: 120 },
  airTransport: { manpower: 2, supply: 0, steel: 90, minutes: 75 },
  escort: { manpower: 5, supply: 0, steel: 175, minutes: 180 },
  cargo: { manpower: 3, supply: 0, steel: 120, minutes: 100 },
  carrier: { manpower: 9, supply: 0, steel: 430, minutes: 480 },
};

export const TIER_2_FACTOR = 1.6;
export const TIER_2_INDUSTRY_LEVEL = 2;
export const MAX_UNITS_PER_BATCH = 20;
export const MAX_QUEUED_BATCHES = 12;

/** The industrial complex does not only unlock tier 2, it speeds up the line. */
export function industrySpeed(level: number): number {
  return 1 + (level - 1) * 0.225;
}

export function recruitmentCost(
  role: UnitRole,
  tier: UnitTier,
  count: number,
  industryLevel: number,
) {
  const base = COST_BY_ROLE[role];
  const factor = tier === 2 ? TIER_2_FACTOR : 1;
  return {
    manpower: Math.round(base.manpower * factor) * count,
    supply: Math.round(base.supply * factor) * count,
    steel: Math.round(base.steel * factor) * count,
    minutes: Math.round((base.minutes * factor * count) / industrySpeed(industryLevel)),
  };
}

export const BASE_BUILDING_COST = 200;
export const LEVEL_COST_FACTOR = 1.8;
export const BASE_CONSTRUCTION_MINUTES = 30;

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS_TO_LAUNCH = 2;

export const DEFAULT_REST_WINDOW = { startMinutes: 23 * 60, endMinutes: 7 * 60 };

export function levelCost(level: number): number {
  return Math.round(BASE_BUILDING_COST * LEVEL_COST_FACTOR ** (level - 1));
}

export function constructionMinutes(level: number): number {
  return Math.round(BASE_CONSTRUCTION_MINUTES * LEVEL_COST_FACTOR ** (level - 1));
}
