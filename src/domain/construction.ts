import { BUILDINGS, type BuildingKey, type DepositKey, type ResourceKey } from './ids';
import { EXPLOITED_DEPOSITS, placementRefusal } from './economy';
import { currentStock, type BuildSpec, type Cost, type PlayerView, type RegionView } from './player-view';

/**
 * Why a building is offered here rather than elsewhere. It is the sentence that teaches the
 * map: a player who reads "coal deposit" under a mine has understood the region, not the menu.
 */
export type BuildReason =
  | { readonly kind: 'deposit'; readonly deposit: DepositKey }
  | { readonly kind: 'coastal' };

/**
 * What holds a line back **for now**. The distinction with an impossibility is the whole rule
 * of the panel: what can never happen here is not drawn at all, what is merely blocked stays
 * and says why — "come back in twenty minutes" is information, a wall of grey is not.
 */
export type BuildHold = 'constructionRunning' | 'buildingCap' | 'materials';

export type BuildOption = {
  readonly key: BuildingKey;
  readonly cost: Cost;
  readonly minutes: number;
  readonly reason: BuildReason | null;
  readonly hold: BuildHold | null;
};

/** The region as placement reads it, plus what the player is: the two halves of the rule. */
export type Site = {
  readonly deposit: DepositKey | null;
  readonly coastal: boolean;
  /** The building already standing on this very region — one per region (ADR 0015). */
  readonly standing: BuildingKey | null;
  readonly standingCount: number;
  readonly cap: number;
  readonly hqLevel: number;
  readonly stocks: Readonly<Record<ResourceKey, number>>;
  readonly constructionRunning: boolean;
};

/**
 * What may be built on a region, and what merely holds it back. The rule is
 * `placementRefusal` — the one the server refuses with — read **twice**: once with the
 * circumstances lifted, which says what this ground can ever carry, and once as things
 * actually stand, which says what is blocked today. Two readings of one rule rather than a
 * second copy of it: a copy would offer what the server refuses, or hide what it accepts.
 *
 * Raising a building is deliberately absent. Upgrading belongs to the nation sheet — one verb
 * per surface — so the key already standing here never comes back in the list.
 */
export function buildableOn(site: Site, catalog: Readonly<Record<BuildingKey, BuildSpec>>): ReadonlyArray<BuildOption> {
  const region = { deposit: site.deposit, coastal: site.coastal };
  return BUILDINGS.flatMap((key) => {
    if (key === site.standing) return [];
    // Nothing rises above the headquarters, and a level-1 building needs one standing.
    if (key === 'hq' ? site.hqLevel > 0 : site.hqLevel === 0) return [];

    const byNature = placementRefusal(key, region, {
      onRegion: site.standing,
      standing: 0,
      cap: Number.POSITIVE_INFINITY,
    });
    if (byNature !== null) return [];

    const spec = catalog[key];
    const asThingsStand = placementRefusal(key, region, {
      onRegion: site.standing,
      standing: site.standingCount,
      cap: site.cap,
    });

    return [
      {
        key,
        cost: spec.cost,
        minutes: spec.minutes,
        reason: reasonFor(key, site.deposit),
        hold: site.constructionRunning
          ? 'constructionRunning'
          : asThingsStand === 'BUILDING_CAP_REACHED'
            ? 'buildingCap'
            : affordable(spec.cost, site.stocks)
              ? null
              : 'materials',
      } satisfies BuildOption,
    ];
  });
}

const affordable = (cost: Cost, stocks: Readonly<Record<ResourceKey, number>>): boolean =>
  Object.entries(cost).every(([key, amount]) => stocks[key as ResourceKey] >= (amount ?? 0));

function reasonFor(key: BuildingKey, deposit: DepositKey | null): BuildReason | null {
  if (deposit !== null && EXPLOITED_DEPOSITS[key]?.includes(deposit)) {
    return { kind: 'deposit', deposit };
  }
  return key === 'port' ? { kind: 'coastal' } : null;
}

/**
 * The site a player's view describes for one region, or `null` when that region is none of
 * his business — the view only carries his own ground, so absence *is* the answer to "may I
 * build there".
 */
export function siteOf(view: PlayerView, regionId: string, now: number): Site | null {
  const region: RegionView | undefined = view.me.regions.find((candidate) => candidate.id === regionId);
  if (region === undefined) return null;
  const stocks = Object.fromEntries(
    Object.entries(view.me.resources).map(([key, resource]) => [
      key,
      currentStock(resource, view.loadedAt, now),
    ]),
  ) as Record<ResourceKey, number>;

  return {
    deposit: region.deposit,
    coastal: region.coastal,
    standing: region.buildings[0]?.key ?? null,
    standingCount: view.me.buildings.length,
    cap: view.me.buildingCap,
    hqLevel: view.me.hqLevel,
    stocks,
    constructionRunning: view.me.construction !== null,
  };
}

/** The panel's list, straight from a view. Empty means the region can carry nothing, ever. */
export function buildOptionsAt(
  view: PlayerView,
  regionId: string,
  now: number,
): ReadonlyArray<BuildOption> {
  const site = siteOf(view, regionId, now);
  return site === null ? [] : buildableOn(site, view.buildCatalog);
}
