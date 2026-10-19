import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { isStanding } from '../src/domain/outposts';
import { siteOfPoint } from '../src/domain/economy';
import { outpostReachKm } from './constants';
import { levelOf, playerBuildings } from './buildingReads';
import { outpostsOf, pointOf } from './movement/forces';
import { regionsWithinReach } from './regionGeometry';
import { homeCountryOf, regionFacts, type RegionFacts } from './regions';

/**
 * **A site is what a building hangs from** (ADR 0020 §10): the national soil a player was born
 * on, or one outpost he founded. There are exactly those two, and the union says so — a building
 * cannot be anchored to something in between. It counts nothing: no placement budget survives (ADR 0029).
 */
export type Site =
  { readonly kind: 'home' } | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> };

export const HOME: Site = { kind: 'home' };

/** Un point tel qu'une portée le lit : sa position, son rayon — qui suit son niveau depuis le
 *  31/08 —, **ce que son disque touche** (révision du 17/09) et son identité, pour que l'ancrage
 *  sache de quel site il parle. La couverture est celle que la couleur lit, mémoïsée par point
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
 * pour une seconde question : *puis-je bâtir ici* et *à quel site cela s'ancre* doivent sortir d'une
 * seule géométrie, sans quoi un joueur poserait sur un site qui n'existe pas.
 *
 * La région où un point se tient y est à distance nulle, ce qui **absorbe la précision du 04/09** :
 * elle n'a plus à être passée à part. Deux points à égalité — les siens, tous les deux plantés
 * dans la région — vont au premier fondé : ce n'est pas un litige, c'est le même joueur, et il
 * n'y a que l'ancre du bâtiment qui change de site.
 *
 * Deactivated points anchor like any other: a raid freezes production, it does not move a
 * building's anchor from one site to another (ADR 0020 §10, §6). **Un chantier, lui,
 * n'ancre rien** : il n'ancre aucun bâtiment tant qu'il n'est pas levé (révision du 15/09),
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

/** Standing outposts as the pure reach reads them (`siteOfPoint`). */
export const reachesOf = (outposts: ReadonlyArray<Doc<'outposts'>>) =>
  outposts.map((outpost) => ({
    id: outpost._id,
    lonLat: pointOf(outpost.point),
    reachKm: outpostReachKm(outpost.level),
  }));

/**
 * **Where a placement at this point anchors**, read with nothing else around it (ADR 0029): the
 * national soil when its region is at home, otherwise the closest standing outpost that reaches
 * the point. It is the one question an insert asks — the refusal asked it first.
 */
export async function anchorAt(
  ctx: QueryCtx,
  player: Doc<'players'>,
  regionId: string,
  point: { readonly lon: number; readonly lat: number },
): Promise<Site | null> {
  const region = regionFacts(regionId);
  if (region === null) return null;
  return siteOfPoint(
    [point.lon, point.lat],
    region.country === homeCountryOf(player.nation),
    reachesOf(await standingOutpostsOf(ctx, player._id)),
  );
}

/** **Les points debout de ce joueur**, et c'est ce qu'un site veut dire : un chantier
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
 * reaches has no anchor, and nothing more goes up there. Both doors refuse such a
 * placement long before this (`OUT_OF_OUTPOST_REACH`), so it is a floor, not a path.
 */
export const anchored = (site: Site | null): { outpostId?: Id<'outposts'> | null } =>
  site === null ? {} : site.kind === 'home' ? { outpostId: null } : { outpostId: site.outpostId };

export type Sites = {
  readonly buildings: ReadonlyArray<Doc<'buildings'>>;
  readonly outposts: ReadonlyArray<Doc<'outposts'>>;
  readonly homeCountry: string | null;
  readonly hqLevel: number;
  /** Where a placement on this region would anchor — `null` when nothing living reaches it. */
  readonly siteAt: (regionId: string) => Site | null;
};

/**
 * **Every site of a player and where a region anchors**, read once. Both doors of the placement
 * rule go through it and so does the view: a second reading of the same sites is a screen that
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

  return {
    buildings,
    outposts,
    homeCountry,
    hqLevel,
    siteAt,
  };
}
