import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { BuildingKey } from '../src/domain/ids';
import { reachingOutpost } from '../src/domain/outposts';
import { homeSlots, outpostReachKm } from './constants';
import { levelOf, playerBuildings } from './buildings';
import { outpostsOf, pointOf } from './movement/forces';
import { foundationOf, homeCountryOf, regionFacts, type RegionFacts } from './regions';

/**
 * **A site is what carries placements** (ADR 0020 §10): the national soil a player was born on,
 * or one outpost he founded. There are exactly those two, and the union says so — a building
 * cannot be anchored to something in between, and no reading has to guess which budget it eats.
 *
 * The number of placements a site carries is **its level**: two per headquarters level at home,
 * its own level for an outpost. The level is a decision the player paid for, where the wealth of
 * a region is a fact of the map that already pays through its deposits.
 */
export type Site =
  { readonly kind: 'home' } | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> };

export const HOME: Site = { kind: 'home' };

export const sameSite = (one: Site, other: Site): boolean =>
  one.kind === 'home'
    ? other.kind === 'home'
    : other.kind === 'outpost' && other.outpostId === one.outpostId;

/** Un point tel qu'une portée le lit : son emplacement, son rayon — qui suit son niveau depuis le
 *  31/08 — et son identité, pour que l'ancrage sache de quel budget il parle. */
export const reachOf = (outpost: Doc<'outposts'>) => ({
  point: pointOf(outpost.point),
  reachKm: outpostReachKm(outpost.level),
  id: outpost._id,
});

/**
 * **Where a placement on this region anchors** — national soil at home, otherwise the nearest
 * outpost whose reach covers it, and `null` when none does. **Le plus proche qui porte jusque-là,
 * jamais le plus proche tout court** : deux points de niveaux différents ne couvrent pas le même
 * cercle depuis que la portée suit le niveau (31/08). It is the very reach the placement
 * rule already refuses with (`OUT_OF_OUTPOST_REACH`), read a second time for a second question:
 * *may I build here* and *whose budget does it eat* have to answer off one radius, or a player
 * would be allowed to place on a site that does not exist.
 *
 * Deactivated points anchor like any other: a raid freezes production, it does not move a
 * building's placement from one budget to another (ADR 0020 §10, §6).
 */
export function siteFor(
  region: RegionFacts,
  homeCountry: string | null,
  outposts: ReadonlyArray<Doc<'outposts'>>,
): Site | null {
  if (homeCountry !== null && region.country === homeCountry) return HOME;
  const nearest = reachingOutpost(region.point, outposts.map(reachOf));
  if (nearest === null) return null;
  return { kind: 'outpost', outpostId: nearest.nearest.id };
}

/**
 * **Where a placement on this region anchors, read with nothing else around it.** It is the one
 * question an insert asks — `sitesOf` answers it too, but a `finish` has no budget to read and
 * no reason to build one.
 */
export async function anchorAt(
  ctx: QueryCtx,
  player: Doc<'players'>,
  regionId: string,
): Promise<Site | null> {
  const region = regionFacts(regionId);
  if (region === null) return null;
  return siteFor(region, homeCountryOf(player.nation), await outpostsOf(ctx, player._id));
}

/**
 * The anchor as the row carries it. **An anchor that resolves to nothing writes no field at
 * all**, which reads back exactly as it should — a building on ground no site of the player
 * reaches counts against no budget, and nothing more goes up there. Both doors refuse such a
 * placement long before this (`OUT_OF_OUTPOST_REACH`), so it is a floor, not a path.
 */
export const anchored = (site: Site | null): { outpostId?: Id<'outposts'> | null } =>
  site === null ? {} : site.kind === 'home' ? { outpostId: null } : { outpostId: site.outpostId };

/** What one site carries, and what stands on it. `taken` counts what is **standing** only: the
 *  prepaid queue is added by whoever holds it, server-side at the enqueue and client-side on the
 *  panel — two numbers for one fact would disagree. */
export type SiteBudget = {
  readonly site: Site;
  readonly taken: number;
  readonly total: number;
};

export type Sites = {
  readonly buildings: ReadonlyArray<Doc<'buildings'>>;
  readonly outposts: ReadonlyArray<Doc<'outposts'>>;
  readonly homeCountry: string | null;
  readonly hqLevel: number;
  /** Where a placement on this region would anchor — `null` when nothing living reaches it. */
  readonly siteAt: (regionId: string) => Site | null;
  /** Home first, then the outposts in the order they were founded. */
  readonly budgets: ReadonlyArray<SiteBudget>;
  readonly budgetOf: (site: Site) => SiteBudget | null;
};

/**
 * **Every site of a player and what is left on it**, read once. Both doors of the placement
 * rule go through it and so does the view: a second count of the same budget is a screen that
 * offers what the server refuses.
 */
export async function sitesOf(ctx: QueryCtx, player: Doc<'players'>): Promise<Sites> {
  const buildings = await playerBuildings(ctx, player._id);
  const outposts = await outpostsOf(ctx, player._id);
  const homeCountry = homeCountryOf(player.nation);
  const hqLevel = levelOf(buildings, 'hq');

  const siteAt = (regionId: string): Site | null => {
    const region = regionFacts(regionId);
    return region === null ? null : siteFor(region, homeCountry, outposts);
  };

  /**
   * **The anchor is read off the row, never recomputed** — except for the rows written before
   * the field existed, which carry no anchor at all and are re-read by geography once. Absent
   * and `null` are therefore different answers here, and the whole tolerance leaves with the
   * next wipe (`schema.ts`).
   */
  const siteOfBuilding = (building: Doc<'buildings'>): Site | null =>
    building.outpostId === undefined
      ? siteAt(building.regionId)
      : building.outpostId === null
        ? HOME
        : { kind: 'outpost', outpostId: building.outpostId };

  const placed = buildings.map((building) => ({
    key: building.key,
    site: siteOfBuilding(building),
  }));
  const foundation = foundationOf(player.nation);

  const budgets: ReadonlyArray<SiteBudget> = [
    { site: HOME, taken: takenAtHome(placed, foundation), total: homeSlots(hqLevel) },
    ...outposts.map((outpost) => {
      const site: Site = { kind: 'outpost', outpostId: outpost._id };
      return {
        site,
        taken: placed.filter((held) => held.site !== null && sameSite(held.site, site)).length,
        total: outpost.level,
      };
    }),
  ];

  return {
    buildings,
    outposts,
    homeCountry,
    hqLevel,
    siteAt,
    budgets,
    budgetOf: (site) => budgets.find((budget) => sameSite(budget.site, site)) ?? null,
  };
}

/**
 * **The headquarters and the foundation are outside the count.** The capital is not a placement
 * — a nation has one, it does not build one (ADR 0015) — and what the season *offers* must not
 * be paid for in freedom: a ground owed five extractors would otherwise open with less room than
 * a poor one, which is the exact inversion of the distribution guard rails of ADR 0015.
 *
 * One free instance per debt, and no more: a nation owed two mines has its first two mines at
 * home off the count, the third eats a placement like anything else. The multiset is the
 * foundation itself (`foundationOf`), so the exemption and the debt cannot say different things.
 */
function takenAtHome(
  placed: ReadonlyArray<{ readonly key: BuildingKey; readonly site: Site | null }>,
  foundation: ReadonlyArray<BuildingKey>,
): number {
  const free = new Map<BuildingKey, number>();
  for (const key of foundation) free.set(key, (free.get(key) ?? 0) + 1);

  let taken = 0;
  for (const held of placed) {
    if (held.site === null || held.site.kind !== 'home' || held.key === 'hq') continue;
    const owed = free.get(held.key) ?? 0;
    if (owed > 0) free.set(held.key, owed - 1);
    else taken += 1;
  }
  return taken;
}
