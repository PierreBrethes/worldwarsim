/**
 * The season a format opens, and the connection profiles that decide what a player actually
 * gets to do in it. The seven-hour rest window (design sheet 07) is carved out of the check-in
 * hours: a player asleep is a player who takes no action, and pretending otherwise is what made
 * the first pass of this study report a permanent player.
 *
 * **The foundation is not a starting site.** The season owes it; the player places it, free and
 * standing at once, wherever he decides. Since the 13/09 the headquarters is the first of those
 * debts, so a season starts on bare ground — no building and no troop — exactly as
 * `seasons.launch` leaves it.
 */

import { SEASON_FORMATS, foundationFor, startingStock, tier2HqLevel } from './constants.mjs';

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
 * Where the player puts each key the season owes him. The game rule says *which* keys; the
 * site and its deposit are the instrument's business, and they stand in for the region a
 * player would aim at.
 */
const FOUNDATION_SITES = {
  hq: [{ site: 'hq', deposit: null }],
  mine: [
    { site: 'mine-ore', deposit: 'ore' },
    { site: 'mine-coal', deposit: 'coal' },
  ],
  farm: [{ site: 'farm-1', deposit: 'food' }],
  mill: [{ site: 'mill-1', deposit: 'textile' }],
  oilWell: [{ site: 'oilwell-1', deposit: 'oil' }],
};

/**
 * **The ground the instrument measures on.** Since 25/08 the foundation is national, so a
 * single-player study has to name the nation it reads for: **France** — iron, coal, bread and
 * cloth, no oil — which is the common shape of the map (six of the eight hold no oil, and every
 * one of the eight holds the four dry resources). A ground owed a fifth extractor, the United
 * States or the USSR, opens one placement richer and one ceiling slot poorer.
 *
 * Changing this line is how the study is re-run for another nation; nothing else here reads a
 * flag.
 */
export const REFERENCE_GROUND = ['ore', 'coal', 'food', 'textile'];

/** **Le sol à cinq extracteurs** — les États-Unis, le pétrole en plus. C'est le seul endroit où
 *  la pose due hors plafond se mesure : sur la France elle ne change rien, la dette y tenant
 *  sous le plafond. */
export const REFERENCE_GROUND_OIL = ['ore', 'coal', 'food', 'textile', 'oil'];

export function foundationOrders(format, ground = REFERENCE_GROUND) {
  return foundationFor(ground).map(({ key, deposit }) => {
    const place = FOUNDATION_SITES[key]?.find((candidate) => candidate.deposit === deposit);
    if (!place) throw new Error(`no site for the ${key} on ${deposit} of the ${format} foundation`);
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
    seasonHours: spec.defaultDurationHours,
    seed: overrides.seed ?? 1,
    checkInHours: profile.checkInHours,
    profileName: profile.name,
    lossesPerDay: overrides.lossesPerDay ?? 0,
    startingStock: { ...startingStock(format), ...(overrides.startingStock ?? {}) },
    /**
     * **Rien n'est planté** (décision 1b du 13/09) : le quartier général est la première dette du
     * socle, pas un bâtiment du lancement, et la compagnie d'infanterie naît avec lui. Une saison
     * s'ouvre donc sur un sol nu, exactement comme `seasons.launch` la laisse.
     */
    startingSites: overrides.startingSites ?? [],
    foundation: overrides.foundation ?? foundationOrders(format, overrides.ground),
    tuning: {
      hqLevelAtLaunch: spec.hqLevelAtLaunch,
      maxHqLevel: spec.maxHqLevel,
      buildingCapBase: spec.buildingCapBase,
      buildingCapPerHqLevel: spec.buildingCapPerHqLevel,
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
