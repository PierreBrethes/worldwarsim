import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import type { BuildingKey, DepositKey } from '../src/domain/ids';
import { depositOfRegion } from '../src/domain/world';
import { isStanding } from '../src/domain/outposts';
import { homeSlots, outpostReachKm, settlesDebt, type FoundationDebt } from './constants';
import { levelOf, playerBuildings } from './buildingReads';
import { outpostsOf, pointOf } from './movement/forces';
import { regionsWithinReach } from './regionGeometry';
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
 *  31/08 —, **ce que son disque touche** (révision du 17/09) et son identité, pour que l'ancrage
 *  sache de quel budget il parle. La couverture est celle que la couleur lit, mémoïsée par point
 *  et par rayon : deux mesures du même cercle finiraient par se contredire. */
export const reachOf = (outpost: Doc<'outposts'>) => ({
  point: pointOf(outpost.point),
  reachKm: outpostReachKm(outpost.level),
  covers: regionsWithinReach(pointOf(outpost.point), outpostReachKm(outpost.level)),
  id: outpost._id,
});

/**
 * **Where a placement on this region anchors** — national soil at home, otherwise the outpost
 * whose disc touches it from closest, and `null` when none does.
 *
 * **Le disque, exactement celui de la couleur** (révision du 17/09/2026 de l'ADR 0020 §1) : une
 * région est atteinte dès qu'une de ses cellules entre dans le rayon, et le départage est la
 * distance à cette cellule-là. Mesurer ici au pôle d'inaccessibilité quand la couleur se mesure au
 * disque brisait la phrase que l'ADR appuie — *là où je tiens est là où je peux bâtir* : le joueur
 * voyait trois régions à sa couleur et n'en trouvait qu'une où poser quoi que ce soit, celle où le
 * mât se tient. Constat de Pierre, 17/09, un point au triple point São Paulo / Minas Gerais / Rio.
 *
 * C'est la même lecture que le serveur refuse avec (`OUT_OF_OUTPOST_REACH`), lue une seconde fois
 * pour une seconde question : *puis-je bâtir ici* et *quel budget cela mange* doivent sortir d'une
 * seule géométrie, sans quoi un joueur poserait sur un site qui n'existe pas.
 *
 * La région où un point se tient y est à distance nulle, ce qui **absorbe la précision du 04/09** :
 * elle n'a plus à être passée à part. Deux points à égalité — les siens, tous les deux plantés
 * dans la région — vont au premier fondé : ce n'est pas un litige, c'est le même joueur, et il
 * n'y a que le budget d'emplacements qui change de colonne.
 *
 * Deactivated points anchor like any other: a raid freezes production, it does not move a
 * building's placement from one budget to another (ADR 0020 §10, §6). **Un chantier, lui,
 * n'ancre rien** : il n'offre aucun emplacement tant qu'il n'est pas levé (révision du 15/09),
 * et l'appelant le retire de la liste avant d'arriver ici — la géométrie ne date rien.
 */
export function siteFor(
  region: RegionFacts,
  homeCountry: string | null,
  outposts: ReadonlyArray<Doc<'outposts'>>,
): Site | null {
  if (homeCountry !== null && region.country === homeCountry) return HOME;
  let nearest: { readonly outpostId: Id<'outposts'>; readonly km: number } | null = null;
  for (const outpost of outposts) {
    const km = reachOf(outpost).covers.get(region.id);
    if (km === undefined) continue;
    if (nearest === null || km < nearest.km) nearest = { outpostId: outpost._id, km };
  }
  return nearest === null ? null : { kind: 'outpost', outpostId: nearest.outpostId };
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
  return siteFor(region, homeCountryOf(player.nation), await standingOutpostsOf(ctx, player._id));
}

/** **Les points debout de ce joueur**, et c'est ce qu'un emplacement veut dire : un chantier
 *  n'est pas encore un site (révision du 15/09 de l'ADR 0020 §10). */
const standingOutpostsOf = async (
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<ReadonlyArray<Doc<'outposts'>>> => {
  const now = Date.now();
  return (await outpostsOf(ctx, playerId)).filter((outpost) => isStanding(outpost, now));
};

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
  const outposts = await standingOutpostsOf(ctx, player._id);
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
    deposit: depositOfRegion(building.regionId),
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
 * **The headquarters and the foundation are outside the count.** Le quartier général n'est pas
 * un emplacement (ADR 0020 §10) : il les **porte**, et se les faire payer par le sol qu'il
 * ouvre serait une pose impossible depuis qu'il se pose (décision 1b du 13/09). Et ce que la
 * saison *offre* ne doit pas se payer en liberté : un sol qui doit cinq extracteurs ouvrirait
 * sinon avec moins de place qu'un pauvre, l'exacte inversion des garde-fous de l'ADR 0015.
 *
 * One free instance per debt, and no more, **et une dette s'acquitte sur son gisement** : une
 * nation qui a du fer et du charbon a sa mine de fer et sa mine de charbon hors du compte, une
 * seconde mine sur du charbon mange un emplacement. Le socle est le même (`foundationOf`) et
 * l'accord aussi (`settlesDebt`), donc l'exemption et la dette ne peuvent pas dire deux choses.
 */
function takenAtHome(
  placed: ReadonlyArray<{
    readonly key: BuildingKey;
    readonly deposit: DepositKey | null;
    readonly site: Site | null;
  }>,
  foundation: ReadonlyArray<FoundationDebt>,
): number {
  const free = foundation.map((due) => ({ due, spent: false }));

  let taken = 0;
  for (const held of placed) {
    if (held.site === null || held.site.kind !== 'home' || held.key === 'hq') continue;
    const owed = free.find((entry) => !entry.spent && settlesDebt(entry.due, held));
    if (owed) owed.spent = true;
    else taken += 1;
  }
  return taken;
}
