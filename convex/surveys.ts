/**
 * **Ce que chaque joueur a relevé du sol, et quand** (ADR 0020 §5). La règle est pure et testée
 * sans base (`src/domain/control.ts`) ; ici il n'y a que l'écriture et les portées qu'on lui
 * tend.
 *
 * **Il n'y a pas d'horloge.** Une *passe de résolution* est la résolution d'un engagement
 * (ADR 0018), pas un battement, et rien dans ce jeu ne bat. Les points d'échantillonnage sont
 * donc les **événements** — pose d'une troupe, fondation d'un avant-poste, départ et arrivée
 * d'un mouvement — et la vérité n'est lue qu'à ces instants-là, dans une mutation, jamais dans
 * une requête réactive (`WWS/docs/technique/brouillard-et-fanout.md`).
 */

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { coveredRegions, heldRegions, surveyStops, type Observer } from '../src/domain/control';
import type { LonLat } from '../src/domain/geo';
import { playerBuildings } from './buildings';
import {
  LISTENING_STATION_RADIUS_KM,
  SCOUT_RADIUS_KM,
  SURVEY_REFRESH_HOURS,
  outpostReachKm,
} from './constants';
import { movementsOf, outpostsOf, pointOf, seasonOutposts } from './movement/forces';
import { allRegions, homeCountryOf, pointOfBuilding, type RegionFacts } from './regions';

/**
 * **Les portées qu'un joueur tient debout**, et rien de ce qu'elles voient. Les mêmes détecteurs
 * que le brouillard des mouvements (`movement/detection.ts`), à deux nuances près, et les deux
 * sont des décisions :
 *
 * - **tout avant-poste relève, pas seulement le poste d'écoute.** Le sol autour d'un point est
 *   ce que ce point *tient* déjà (§1) ; ignorer qui le tient serait tenir sans regarder.
 * - **un point désactivé relève quand même** — même lecture que `recognises` : un raid brûle le
 *   dépôt, il n'aveugle pas le relais.
 *
 * Une troupe en marche ne relève pas d'ici : elle porte encore son adresse, mais elle n'y est
 * pas. C'est son trajet qui relève, à l'arrivée.
 */
export async function standingObserversOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<ReadonlyArray<Observer>> {
  const observers: Array<Observer> = [];

  for (const outpost of await outpostsOf(ctx, playerId)) {
    observers.push({ point: pointOf(outpost.point), radiusKm: outpostReachKm(outpost.level) });
  }

  for (const building of await playerBuildings(ctx, playerId)) {
    if (building.key !== 'listening') continue;
    const stand = pointOfBuilding(building);
    if (stand !== null) {
      observers.push({ point: stand, radiusKm: LISTENING_STATION_RADIUS_KM });
    }
  }

  const marching = new Set<Id<'troops'>>(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  for (const troop of await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect()) {
    const address = troop.stationedAt;
    if (marching.has(troop._id) || address === null || typeof address === 'string') continue;
    observers.push({ point: pointOf(address), radiusKm: SCOUT_RADIUS_KM });
  }

  return observers;
}

/**
 * **Une observation, écrite une fois.** Elle croise deux choses que rien d'autre ne réunit : la
 * vérité du moment, lue depuis les avant-postes debout, et ce que ces portées-là couvrent.
 *
 * Les écritures sont bornées par deux règles, et sans elles un mouvement transcontinental
 * écrirait des centaines de lignes pour rien :
 *
 * - **même tenant et ligne récente, on ne réécrit pas** (`SURVEY_REFRESH_HOURS`) ;
 * - **une région que personne ne tient ne fonde pas de ligne.** Elle en efface une, si le joueur
 *   en avait une — c'est exactement ce qui corrige une couleur périmée — mais elle n'en crée
 *   jamais : les trois quarts du monde ne sont à personne, et une ligne « rien ici » par région
 *   traversée ferait de ce relevé une copie du planisphère.
 *
 * **Son propre sol ne se relève pas non plus.** Il est servi à jour par la lecture, sans ligne et
 * sans date, parce qu'une nation n'est jamais annexée (ADR 0004) : une colonne qui traverse la
 * France y écrirait quatre-vingt-dix lignes qu'aucun lecteur ne regardera jamais.
 *
 * Rend le nombre de lignes touchées : c'est la mesure que le coût de ce système se lit dessus.
 */
export async function fileSurvey(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  observers: ReadonlyArray<Observer>,
  at: number,
  over: ReadonlyArray<RegionFacts> = allRegions(),
): Promise<number> {
  if (observers.length === 0) return 0;
  const covered = coveredRegions(over, observers);
  if (covered.size === 0) return 0;

  const player = await ctx.db.get(playerId);
  if (player === null) return 0;

  const seen = over.filter((region) => covered.has(region.id));
  const truth = heldRegions({
    regions: seen,
    outposts: (await seasonOutposts(ctx, player.seasonId)).map((outpost) => ({
      owner: outpost.playerId as string,
      point: pointOf(outpost.point),
      reachKm: outpostReachKm(outpost.level),
    })),
    homeGrounds: await homeGroundsOf(ctx, player.seasonId),
  });

  const home = homeCountryOf(player.nation);
  const staleAfter = SURVEY_REFRESH_HOURS * 3_600_000;
  let written = 0;
  for (const region of seen) {
    if (region.country === home) continue;
    const owner = (truth.get(region.id) ?? null) as Id<'players'> | null;
    const row = await ctx.db
      .query('regionSightings')
      .withIndex('byPlayerRegion', (q) => q.eq('playerId', playerId).eq('regionId', region.id))
      .unique();

    if (row === null) {
      if (owner === null) continue;
      await ctx.db.insert('regionSightings', {
        playerId,
        regionId: region.id,
        ownerId: owner,
        seenAt: at,
      });
      written += 1;
      continue;
    }
    if (row.ownerId === owner && at - row.seenAt < staleAfter) continue;
    await ctx.db.patch(row._id, { ownerId: owner, seenAt: at });
    written += 1;
  }
  return written;
}

/** Le sol d'origine des sièges de la saison — ce qu'aucun avant-poste ne prend (ADR 0004). */
async function homeGroundsOf(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<ReadonlyArray<{ owner: string; country: string }>> {
  const seats = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  return seats.flatMap((seat) => {
    const country = homeCountryOf(seat.nation);
    return country === null ? [] : [{ owner: seat._id as string, country }];
  });
}

/** Une troupe posée relève le sol autour d'elle, au même rayon qu'elle relève ce qui passe. */
export const surveyFromPoint = (
  ctx: MutationCtx,
  playerId: Id<'players'>,
  point: LonLat,
  at: number,
): Promise<number> => fileSurvey(ctx, playerId, [{ point, radiusKm: SCOUT_RADIUS_KM }], at);

/**
 * **Ce qu'une colonne a vu du couloir qu'elle vient de marcher**, relevé à l'arrivée et pas au
 * départ : une route calculée n'est pas une route parcourue, et donner la carte du chemin à qui
 * n'a pas encore fait un pas rendrait le renseignement gratuit. Les haltes sortent de la
 * polyligne du mouvement, celle que `convex/routes.ts` a calculée une fois.
 */
export const surveyAlongRoute = (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  at: number,
): Promise<number> =>
  fileSurvey(
    ctx,
    movement.playerId,
    surveyStops(movement.points.map(pointOf), SCOUT_RADIUS_KM).map((point) => ({
      point,
      radiusKm: SCOUT_RADIUS_KM,
    })),
    at,
  );

/**
 * **Une fondation change la vérité autour d'un point, et chacun l'apprend s'il regarde.** Le
 * fondateur en premier — son point est déjà dans ses portées quand on arrive ici — mais aussi
 * tout siège dont une portée à lui couvre le sol qui vient de changer de main : il est sur place,
 * il verrait le drapeau se planter.
 *
 * Le balayage est borné des deux côtés : huit sièges au plus, et les seules régions que le
 * nouveau point peut avoir touchées — `reachKm` est le rayon **de ce point-là**, lu sur son
 * niveau par l'appelant qui vient de le planter.
 */
export async function surveyFoundation(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  point: LonLat,
  reachKm: number,
  at: number,
): Promise<number> {
  const reached = coveredRegions(allRegions(), [{ point, radiusKm: reachKm }]);
  const touched = allRegions().filter((region) => reached.has(region.id));
  if (touched.length === 0) return 0;

  const seats = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();

  let written = 0;
  for (const seat of seats) {
    written += await fileSurvey(
      ctx,
      seat._id,
      await standingObserversOf(ctx, seat._id),
      at,
      touched,
    );
  }
  return written;
}
