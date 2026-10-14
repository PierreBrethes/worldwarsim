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
import { surveyStops } from '../src/domain/control';
import type { LonLat } from '../src/domain/geo';
import type { UnitRole } from '../src/domain/ids';
import { isNation } from '../src/domain/nations';
import { isStanding } from '../src/domain/outposts';
import { playerBuildings, seasonBuildings } from './buildingReads';
import {
  LISTENING_STATION_RADIUS_KM,
  DETECTION_RANGE_KM,
  SURVEY_REFRESH_HOURS,
  detectionRangeOf,
  outpostReachKm,
} from './constants';
import { heldOver } from './holding';
import { regionsCoveredBy, regionsWithinReach } from './regionGeometry';
import { movementsOf, outpostsOf, pointOf } from './movement/forces';
import { seatsOf } from './seats';
import {
  allRegions,
  capitalRegionOf,
  homeCountryOf,
  pointOfBuilding,
  regionFacts,
  type RegionFacts,
} from './regions';

/**
 * **Les portées qu'un joueur tient debout**, et rien de ce qu'elles voient. Les mêmes détecteurs
 * que le brouillard des mouvements (`movement/detection.ts`), à deux nuances près, et les deux
 * sont des décisions :
 *
 * - **tout avant-poste relève, pas seulement le poste d'écoute.** Le sol autour d'un point est
 *   ce que ce point *tient* déjà (§1) ; ignorer qui le tient serait tenir sans regarder. Il
 *   relève **la région où il se tient** avant toute mesure (précision du 04/09) : il tient ce
 *   sol-là, donc il le voit.
 * - **un point désactivé relève quand même** — même lecture que `recognises` : un raid brûle le
 *   dépôt, il n'aveugle pas le relais. **Un chantier, non** : il ne tient pas ce sol-là, donc il
 *   ne le voit pas (révision du 15/09). Sa garnison, elle, relève à sa propre portée, comme
 *   n'importe quelle pile posée — c'est la troupe qui regarde, pas le point.
 *
 * Une troupe en marche ne relève pas d'ici : elle porte encore son adresse, mais elle n'y est
 * pas. C'est son trajet qui relève, à l'arrivée.
 */
/**
 * **Un détecteur posé, tel que le relevé du sol le lit** : un point et une portée, jamais ce
 * qu'il est. Une troupe, une station, un avant-poste ne se distinguent en rien ici — ils
 * regardent, et c'est leur disque qui dit le sol qu'ils relèvent (`regionsCoveredBy`).
 */
/** Un disque qui ne touche que la cellule où il se tient : sa propre région, rien d'autre. */
const OWN_GROUND_KM = 1;

export type Observer = { readonly point: LonLat; readonly radiusKm: number };

export async function standingObserversOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<ReadonlyArray<Observer>> {
  const observers: Array<Observer> = [];

  const outposts = await outpostsOf(ctx, playerId);
  const now = Date.now();
  for (const outpost of outposts) {
    if (!isStanding(outpost, now)) continue;
    observers.push({
      point: pointOf(outpost.point),
      radiusKm: outpostReachKm(outpost.level),
    });
  }

  const buildings = await playerBuildings(ctx, playerId);
  for (const building of buildings) {
    /** Un bâtiment capturé voit le sol qu'il tient — sans quoi sa couleur se délaverait chez son
     *  capteur comme un relevé ancien. */
    const stand = pointOfBuilding(building);
    if (stand === null) continue;
    if (building.capturedAt !== undefined) {
      observers.push({ point: stand, radiusKm: OWN_GROUND_KM });
    }
    if (building.key === 'listening') {
      observers.push({ point: stand, radiusKm: LISTENING_STATION_RADIUS_KM });
    }
  }

  const marching = new Set<Id<'troops'>>(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  const outpostById = new Map(outposts.map((outpost) => [outpost._id, outpost]));
  const buildingById = new Map(buildings.map((building) => [building._id, building]));
  const player = await ctx.db.get(playerId);
  for (const troop of await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect()) {
    if (marching.has(troop._id)) continue;
    const address = troop.stationedAt;
    let point: LonLat | null;
    if (address === null) {
      const capital =
        player !== null && isNation(player.nation)
          ? regionFacts(capitalRegionOf(player.nation))
          : null;
      point = capital?.point ?? null;
    } else if (typeof address !== 'string') point = pointOf(address);
    else {
      const outpost = outpostById.get(address as Id<'outposts'>);
      if (outpost !== undefined) point = pointOf(outpost.point);
      else {
        const building = buildingById.get(address as Id<'buildings'>);
        point = building === undefined ? null : pointOfBuilding(building);
      }
    }
    if (point !== null) {
      observers.push({ point, radiusKm: detectionRangeOf([troop.role]) });
    }
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
  const covered = regionsCoveredBy(observers);
  if (covered.size === 0) return 0;

  const player = await ctx.db.get(playerId);
  if (player === null) return 0;

  const seen = over.filter((region) => covered.has(region.id));
  const truth = await heldOver(ctx, player.seasonId, seen, at);
  const installationsByRegion = new Map<
    string,
    Array<{ buildingId: Id<'buildings'>; key: Doc<'buildings'>['key'] }>
  >();
  for (const building of await seasonBuildings(ctx, player.seasonId)) {
    if (building.playerId === playerId || !covered.has(building.regionId)) continue;
    const installations = installationsByRegion.get(building.regionId) ?? [];
    installations.push({ buildingId: building._id, key: building.key });
    installationsByRegion.set(building.regionId, installations);
  }

  const home = homeCountryOf(player.nation);
  const staleAfter = SURVEY_REFRESH_HOURS * 3_600_000;
  let written = 0;
  for (const region of seen) {
    const owner = (truth.get(region.id) ?? null) as Id<'players'> | null;
    const installations = installationsByRegion.get(region.id) ?? [];
    /** **Son sol ne se relève que s'il porte un mât adverse** — un bâtiment capturé chez soi
     *  (14/10) : sans ligne, le perdant n'avait ni mât à viser ni branche pour le reprendre. Le
     *  reste de son sol reste servi par la lecture, et la ligne part quand le mât revient. */
    if (region.country === home && installations.length === 0) {
      const stale = await ctx.db
        .query('regionSightings')
        .withIndex('byPlayerRegion', (q) => q.eq('playerId', playerId).eq('regionId', region.id))
        .unique();
      if (stale !== null) await ctx.db.delete(stale._id);
      continue;
    }
    const row = await ctx.db
      .query('regionSightings')
      .withIndex('byPlayerRegion', (q) => q.eq('playerId', playerId).eq('regionId', region.id))
      .unique();

    if (row === null) {
      if (owner === null && installations.length === 0) continue;
      await ctx.db.insert('regionSightings', {
        playerId,
        regionId: region.id,
        ownerId: owner,
        seenAt: at,
        installations,
        hasInstallations: installations.length > 0,
      });
      written += 1;
      continue;
    }
    const previous = row.installations ?? [];
    const sameInstallations =
      previous.length === installations.length &&
      installations.every(
        (installation, index) =>
          previous[index]?.buildingId === installation.buildingId &&
          previous[index]?.key === installation.key,
      );
    if (row.ownerId === owner && sameInstallations && at - row.seenAt < staleAfter) continue;
    await ctx.db.patch(row._id, {
      ownerId: owner,
      seenAt: at,
      installations,
      hasInstallations: installations.length > 0,
    });
    written += 1;
  }
  return written;
}

/** Une troupe posée relève le sol autour d'elle, au même rayon qu'elle relève ce qui passe. */
export const surveyFromPoint = (
  ctx: MutationCtx,
  playerId: Id<'players'>,
  point: LonLat,
  at: number,
  radiusKm = DETECTION_RANGE_KM.infantry,
): Promise<number> => fileSurvey(ctx, playerId, [{ point, radiusKm }], at);

/**
 * **Ce qu'une colonne a vu du couloir qu'elle vient de marcher**, relevé à l'arrivée et pas au
 * départ : une route calculée n'est pas une route parcourue, et donner la carte du chemin à qui
 * n'a pas encore fait un pas rendrait le renseignement gratuit. Les haltes sortent de la
 * polyligne du mouvement, celle que `convex/routes.ts` a calculée une fois.
 */
export const surveyAlongRoute = async (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  at: number,
): Promise<number> => {
  const roles: UnitRole[] = [];
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop !== null) roles.push(troop.role);
  }
  const radiusKm = detectionRangeOf(roles);
  return fileSurvey(
    ctx,
    movement.playerId,
    surveyStops(movement.points.map(pointOf), radiusKm).map((point) => ({ point, radiusKm })),
    at,
  );
};

/**
 * **Une fondation change la vérité autour d'un point, et chacun l'apprend s'il regarde.** Le
 * fondateur en premier — son point est déjà dans ses portées quand on arrive ici — mais aussi
 * tout siège dont une portée à lui couvre le sol qui vient de changer de main : il est sur place,
 * il verrait le drapeau se planter.
 *
 * Le balayage est borné des deux côtés : huit sièges au plus, et les seules régions que le
 * nouveau point peut avoir touchées — **son disque**, la même mesure que la couleur
 * (`regionsWithinReach`, révision du 17/09 de l'ADR 0020 §1). La région où il se plante y est à
 * distance nulle : elle n'a plus à être passée à part, ce qu'un point sibérien exigeait tant que
 * la règle se mesurait au pôle.
 */
export async function surveyFoundation(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  point: LonLat,
  reachKm: number,
  at: number,
): Promise<number> {
  const touched = [...regionsWithinReach(point, reachKm).keys()].flatMap(
    (regionId) => regionFacts(regionId) ?? [],
  );
  if (touched.length === 0) return 0;

  const seats = await seatsOf(ctx, seasonId);

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
