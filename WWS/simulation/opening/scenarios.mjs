/**
 * The season a format opens, and the connection profiles that decide what a player actually
 * gets to do in it. The seven-hour rest window (design sheet 07) is carved out of the check-in
 * hours: a player asleep is a player who takes no action, and pretending otherwise is what made
 * the first pass of this study report a permanent player.
 *
 * **The foundation is not a starting site.** The season owes it; the player places it, free and
 * standing at once, wherever he decides. So a season starts with its headquarters and nothing
 * else, exactly as `seasons.launch` leaves it.
 */

import { SEASON_FORMATS, startingStock, tier2HqLevel } from './constants.mjs';

/** Awake hours, local clock. Rest runs 23 h → 06 h, so nothing is scheduled inside it. */
export const PROFILES = {
  /** Six visits a day. The friend who keeps the tab open. */
  assiduous: { name: 'assidu', checkInHours: [7, 9, 12, 15, 18, 21] },
  /** Two visits a day: morning and evening. The one with a job. */
  occasional: { name: 'occasionnel', checkInHours: [8, 20] },
  /** One visit. The one who forgot. */
  absent: { name: 'absent', checkInHours: [19] },
};

/**
 * Where the player puts each key the season owes him. The game table says *which* keys; the
 * site and its deposit are the instrument's business, and they stand in for the region a
 * player would aim at.
 */
const FOUNDATION_SITES = {
  mine: [
    { site: 'mine-coal', deposit: 'coal' },
    { site: 'mine-ore', deposit: 'ore' },
  ],
  foundry: [{ site: 'foundry-1' }],
  warehouse: [{ site: 'warehouse-1' }],
  farm: [{ site: 'farm-1', deposit: 'food' }],
  arsenal: [{ site: 'arsenal-1' }],
};

export function foundationOrders(format) {
  const used = {};
  return SEASON_FORMATS[format].foundation.map((key) => {
    const rank = used[key] ?? 0;
    used[key] = rank + 1;
    const place = FOUNDATION_SITES[key]?.[rank];
    if (!place) throw new Error(`no site for the ${rank + 1}. ${key} of the ${format} foundation`);
    return { key, ...place };
  });
}

/** The wish list a player carries into a season: an army, and the economy that feeds it. Order
 *  is intent — the policy skips what is refused rather than waiting on it. The foundation is
 *  not in it: it is placed before anything else, and it costs nothing to place. */
export const PLANS = {
  /** Economy first: raise what the foundation put up, then reach past it. */
  economy: [
    { key: 'foundry', site: 'foundry-1' },
    { key: 'mine', site: 'mine-ore' },
    { key: 'barracks', site: 'barracks-1' },
    { key: 'billets', site: 'billets-1' },
    { key: 'mine', site: 'mine-coal' },
    { key: 'arsenal', site: 'arsenal-1' },
    { key: 'farm', site: 'farm-1', deposit: 'food' },
    { key: 'billets', site: 'billets-2' },
    { key: 'warehouse', site: 'warehouse-1' },
    { key: 'listening', site: 'listening-1' },
    { key: 'port', site: 'port-1' },
    { key: 'airfield', site: 'airfield-1' },
  ],
  /** Army first: the barracks on the first evening, whatever it costs. */
  army: [
    { key: 'barracks', site: 'barracks-1' },
    { key: 'billets', site: 'billets-1' },
    { key: 'arsenal', site: 'arsenal-1' },
    { key: 'foundry', site: 'foundry-1' },
    { key: 'mine', site: 'mine-ore' },
    { key: 'billets', site: 'billets-2' },
    { key: 'barracks', site: 'barracks-1' },
    { key: 'mine', site: 'mine-coal' },
    { key: 'warehouse', site: 'warehouse-1' },
    { key: 'listening', site: 'listening-1' },
    { key: 'port', site: 'port-1' },
    { key: 'airfield', site: 'airfield-1' },
  ],
};

export function seasonOf(format, overrides = {}) {
  const spec = SEASON_FORMATS[format];
  const profile = overrides.profile ?? PROFILES.assiduous;
  return {
    name: overrides.name ?? `${format} — ${profile.name}`,
    format,
    seasonHours: spec.durationHours,
    seed: overrides.seed ?? 1,
    checkInHours: profile.checkInHours,
    profileName: profile.name,
    lossesPerDay: overrides.lossesPerDay ?? 0,
    startingStock: { ...startingStock(format), ...(overrides.startingStock ?? {}) },
    /** The headquarters, and nothing else: the foundation is owed, never handed over. */
    startingSites: overrides.startingSites ?? [
      { id: 'hq', key: 'hq', level: spec.hqLevelAtLaunch },
    ],
    foundation: overrides.foundation ?? foundationOrders(format),
    tuning: {
      maxHqLevel: spec.maxHqLevel,
      tier2HqLevel: tier2HqLevel(format),
      ...(overrides.tuning ?? {}),
    },
  };
}

export const scenario48h = (overrides = {}) => seasonOf('skirmish', overrides);

export const PROFILE_DEFAULT = {
  plan: PLANS.economy,
  alloyReserve: 0.5,
  mix: ['infantry', 'infantry', 'armor'],
  ammoTarget: 120,
};
