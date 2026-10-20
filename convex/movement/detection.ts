/**
 * Passive detection, recomputed on board events rather than on reads. The ledgers stay per
 * observer — `sightings` for a thread that went past, `campSightings` for a force standing —
 * so `PlayerView` never filters the season's board and never receives a future window before
 * it opens.
 *
 * **Rien ne s'y engage** (ADR 0024 §3, révision du 13/09/2026) : la rencontre en route a été
 * retirée d'ici — plus de rendez-vous de contact. Détecter est
 * voir ; se battre demande un ordre, et l'ordre est résolu à l'arrivée (`engageAt`). La
 * poursuite d'une Blitz date son contact elle-même (`contactAt`, `movement/pursuit.ts`).
 */

import { reassessCaptures } from '../captures';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { distanceKm, type LonLat } from '../../src/domain/geo';
import {
  INTERCEPTION_SAMPLES,
  mobileSighting,
  positionAt,
  sightingsAlong,
  type MarchingForce,
  type Watcher,
} from '../../src/domain/interception';
import { seenSegment } from '../../src/domain/sighting-segment';
import { RESOURCES, type ResourceKey } from '../../src/domain/ids';
import { isNation } from '../../src/domain/nations';
import { isStanding } from '../../src/domain/outposts';
import { seasonBuildings } from '../buildingReads';
import { cancelJob, isPending } from '../scheduledJobs';
import { economyOf } from '../resources';
import { holdsPoint } from '../strategicPoints';
import {
  detectionRangeOf,
  LAST_KNOWN_HOURS,
  LISTENING_STATION_RADIUS_KM,
  outpostReachKm,
  sightingReachKm,
} from '../constants';
import { seasonTheatre } from './theatre';
import { capitalRegionOf, homeCountryOf, pointOfBuilding, regionFacts } from '../regions';
import { hostAmongCountries, hostAtPoint, landAtPoint } from '../routes';
import { asPoint, pointOf, seasonMovements, seasonOutposts } from './forces';
import { notifyPlayer } from '../notifications';
import { journalUrl, push } from '../../src/domain/push';

type Mobile = {
  readonly movement: Doc<'movements'>;
  readonly force: MarchingForce;
  readonly rangeKm: number;
  /** **Rangoun** : une tournée de son teneur, que chaque détecteur ne relève qu'à sa part. */
  readonly rangoonTour: boolean;
};

const DETECTOR_ORDER = ['territory', 'station', 'outpost', 'troop'] as const;
type Detector = (typeof DETECTOR_ORDER)[number];

type Caught = {
  readonly playerId: Id<'players'>;
  readonly detector: Detector;
  readonly detectorId: Id<'buildings'> | Id<'outposts'> | null;
  readonly detectorHostCountry: string;
  readonly detectorRegion: string | null;
  readonly from: number;
  readonly to: number;
};

type PassiveWatcher = Watcher & Omit<Caught, 'from' | 'to'>;

/**
 * Replaces every prediction affected by the current board. It is called only from mutations that
 * changed a route, a manifest or a detector; no query and no periodic loop enters here.
 *
 * **`changed` : l'événement ne touche qu'un joueur** (#145). Un départ, une arrivée sans combat,
 * un pas de tournée ou une recrue ne changent que les détecteurs de leur joueur — la pile quittée
 * ou rejointe, la colonne née ou finie — et ses propres colonnes comme cibles. Refaire ses relevés
 * à lui et ceux qu'on tient sur ses colonnes rend exactement ce que rendrait la réévaluation
 * complète : rien d'autre sur le plateau n'a bougé, et la grille d'échantillons ne bouge pas avec
 * l'instant (`mobileSighting`). Recroiser chaque
 * colonne avec chaque autre à chaque départ dépassait la seconde d'une mutation passé quarante
 * colonnes. Les camps, les caisses et les captures se relisent toujours en entier : ils lisent la
 * position présente de toutes les colonnes, et ils coûtent peu.
 */
export async function reassessDetection(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now = Date.now(),
  changed?: Id<'players'>,
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null) return;

  const movements = await seasonMovements(ctx, seasonId);

  const active =
    season.status === 'launched' && season.concludedAt === null
      ? movements.filter((movement) => movement.arrivesAt > now)
      : [];
  const board = await detectionBoard(ctx, seasonId, active, now);
  const ledgers = await observerLedgers(ctx, board, movements, changed);

  for (const target of movements) {
    const watchedBy =
      changed === undefined || target.playerId === changed ? null : new Set([changed]);
    const mobile = board.mobileById.get(target._id);
    const desired = mobile === undefined ? [] : sightingsFor(mobile, board, now, watchedBy);
    await syncSightings(
      ctx,
      target,
      await desired,
      now,
      ledgers.sightingsByMovement.get(target._id) ?? [],
    );
  }

  const camps = await forgetStaleSightings(ctx, ledgers, now);

  if (season.status === 'launched' && season.concludedAt === null) {
    await syncCampSightings(ctx, seasonId, board, now, camps);
    await syncLootCrateSightings(ctx, seasonId, board, now);
    await rescheduleLootCrateDetectionJobs(ctx, seasonId, board, now);
    /** **La capture se relit aux mêmes événements que le brouillard** : un départ, une arrivée,
     *  une passe — exactement ce qui peut retirer, tuer ou entamer l'infanterie qui capture. */
    await reassessCaptures(ctx, seasonId, now);
  }
}

/** Re-read only the present board. Quantity changes use this seam so an unchanged route keeps
 * its already validated appointment instead of rebuilding every mobile prediction. */
export async function reassessLootCrateSightings(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now = Date.now(),
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null || season.status !== 'launched' || season.concludedAt !== null) return;
  const movements = (await seasonMovements(ctx, seasonId)).filter(
    (movement) => movement.arrivesAt > now,
  );
  const board = await detectionBoard(ctx, seasonId, movements, now);
  await syncLootCrateSightings(ctx, seasonId, board, now);
}

/** Geometry-changing events refresh both present knowledge and the next mobile transition. */
export async function reassessLootCrateDetection(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now = Date.now(),
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null || season.status !== 'launched' || season.concludedAt !== null) return;
  const movements = (await seasonMovements(ctx, seasonId)).filter(
    (movement) => movement.arrivesAt > now,
  );
  const board = await detectionBoard(ctx, seasonId, movements, now);
  await syncLootCrateSightings(ctx, seasonId, board, now);
  await rescheduleLootCrateDetectionJobs(ctx, seasonId, board, now);
}

/** A stale row, an early callback or a concluded season writes nothing. A valid wake-up applies
 * only what is covered now, then reserves the following transition from the fresh board. */
export async function refreshLootCrateDetection(
  ctx: MutationCtx,
  detectionJobId: Id<'lootCrateDetectionJobs'>,
  expectedAt: number,
  now = Date.now(),
): Promise<void> {
  const prediction = await ctx.db.get(detectionJobId);
  if (prediction === null || prediction.at !== expectedAt || now < expectedAt) return;
  const season = await ctx.db.get(prediction.seasonId);
  if (season === null || season.status !== 'launched' || season.concludedAt !== null) return;
  await ctx.db.patch(prediction._id, { scheduledJobId: undefined });
  await reassessLootCrateDetection(ctx, prediction.seasonId, now);
}

/** A future sighting files its dispatch only when its window truly opens. */
export async function revealSighting(
  ctx: MutationCtx,
  sightingId: Id<'sightings'>,
  now = Date.now(),
): Promise<void> {
  const sighting = await ctx.db.get(sightingId);
  if (sighting === null || sighting.noticeFiled === true || sighting.from > now) return;
  const movement = await ctx.db.get(sighting.movementId);
  if (movement === null) return;
  const season = await ctx.db.get(movement.seasonId);
  if (season === null || season.status !== 'launched' || season.concludedAt !== null) return;

  const seen = seenSegment(marchingForce(movement), sighting.from, sighting.to);
  await ctx.db.insert('notices', {
    playerId: sighting.playerId,
    at: sighting.from,
    kind: 'movementSighted',
    hostCountry: sighting.detectorHostCountry ?? hostAtPoint(pointOf(movement.from)),
    /** The first point of the stretch the observer is served, never the departure or the
     *  destination: the button must not point past the fog. */
    ...(seen.points[0] === undefined
      ? {}
      : { point: { lon: seen.points[0][0], lat: seen.points[0][1] } }),
    /** The heading the column held **on leaving the radius**, the same one the arc serves: a
     *  bearing from departure to destination would word a dispatch on the one thing the sighting
     *  no longer grants (design sheet 04, decision 4a of 13/09/2026). */
    headingDegrees: seen.headingDegrees,
    detector: sighting.detector,
    detectorRegion: sighting.detectorRegion ?? null,
  });
  await notifyPlayer(ctx, sighting.playerId, {
    type: 'sighting',
    phrase: push.sighting,
    url: journalUrl,
    at: sighting.from,
  });
  await ctx.db.patch(sighting._id, { noticeFiled: true, revealJobId: undefined });
}

export const marchingForce = (movement: Doc<'movements'>): MarchingForce => ({
  id: movement._id,
  points: movement.points.map(pointOf),
  legs: movement.legs,
  distanceUnits: movement.distanceUnits,
  ...(movement.landCost === undefined ? {} : { landCost: movement.landCost }),
  createdAt: movement._creationTime,
  departedAt: movement.departedAt,
  arrivesAt: movement.arrivesAt,
});

/**
 * **Un seul réveil de charbon par joueur** (#146). Le même état redonne la même heure (à l'arrondi
 * près) : le job en attente la couvre déjà et reste. Une autre heure, ou plus de charbon qui brûle,
 * l'annule d'abord. La tolérance reste sous la seconde de marge que porte l'heure, pour que le
 * réveil ne parte jamais avant que le charbon soit à sec.
 */
const DRY_TOLERANCE_MS = 500;

async function keepDryWakeUp(
  ctx: MutationCtx,
  player: Doc<'players'> | undefined,
  dryAt: number | null,
): Promise<void> {
  if (player === undefined) return;
  const kept = player.dryJob;
  if (
    kept !== undefined &&
    dryAt !== null &&
    Math.abs(kept.at - dryAt) <= DRY_TOLERANCE_MS &&
    (await isPending(ctx, kept.jobId))
  )
    return;
  if (kept === undefined && dryAt === null) return;
  if (kept !== undefined) await cancelJob(ctx, kept.jobId);
  const dryJob =
    dryAt === null
      ? undefined
      : {
          jobId: await ctx.scheduler.runAt(dryAt, internal.listening.reassess, {
            playerId: player._id,
          }),
          at: dryAt,
        };
  await ctx.db.patch(player._id, { dryJob });
}

async function detectionBoard(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  movements: ReadonlyArray<Doc<'movements'>>,
  now: number,
) {
  const theatre = seasonTheatre(await ctx.db.get(seasonId));
  const [troops, buildings, outposts, players] = await Promise.all([
    ctx.db
      .query('troops')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect(),
    seasonBuildings(ctx, seasonId),
    seasonOutposts(ctx, seasonId),
    ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect(),
  ]);
  const troopById = new Map(troops.map((troop) => [troop._id, troop]));
  /** **Rangoun** : les tournées de son teneur ne se relèvent qu'à la part de portée de
   *  `sightingReachKm`. Relu ici à chaque réévaluation, donc éteint dès que le point change de
   *  main (`handOver` réévalue). */
  const rangoonTours = new Set<Id<'troops'>>();
  const keepers = new Map<Id<'players'>, boolean>();
  for (const troop of troops) {
    if (troop.tour === undefined) continue;
    if (!keepers.has(troop.playerId)) {
      keepers.set(
        troop.playerId,
        await holdsPoint(ctx, { _id: troop.playerId, seasonId }, 'rangoon'),
      );
    }
    if (keepers.get(troop.playerId)) rangoonTours.add(troop._id);
  }
  /** Une pile n'a la part de Rangoun que si tout ce qui la compose est en tournée : une armée
   *  posée à côté d'un camion de tournée ne s'en couvre pas. */
  const allOnRangoonTour = (troopIds: ReadonlyArray<Id<'troops'>>) =>
    troopIds.length > 0 && troopIds.every((id) => rangoonTours.has(id));
  const mobileById = new Map<Id<'movements'>, Mobile>();
  for (const movement of movements) {
    const roles = movement.troopIds.flatMap((troopId) => {
      const troop = troopById.get(troopId);
      return troop === undefined ? [] : [troop.role];
    });
    mobileById.set(movement._id, {
      movement,
      force: marchingForce(movement),
      rangeKm: detectionRangeOf(roles, theatre),
      rangoonTour: allOnRangoonTour(movement.troopIds),
    });
  }

  const moving = new Set(movements.flatMap((movement) => movement.troopIds));
  const buildingById = new Map(buildings.map((building) => [building._id, building]));
  const outpostById = new Map(outposts.map((outpost) => [outpost._id, outpost]));
  const playerById = new Map(players.map((player) => [player._id, player]));
  const posted = new Map<
    string,
    {
      playerId: Id<'players'>;
      point: LonLat;
      roles: Array<Doc<'troops'>['role']>;
      troopIds: Array<Id<'troops'>>;
      detectorHostCountry: string;
      detectorRegion: string | null;
    }
  >();

  for (const troop of troops) {
    if (moving.has(troop._id)) continue;
    const station = stationOf(troop, playerById, buildingById, outpostById);
    if (station === null) continue;
    const key = `${troop.playerId}@${station.point[0]},${station.point[1]}`;
    const held = posted.get(key) ?? {
      playerId: troop.playerId,
      point: station.point,
      roles: [],
      troopIds: [],
      detectorHostCountry: station.hostCountry,
      detectorRegion: station.region,
    };
    held.roles.push(troop.role);
    held.troopIds.push(troop._id);
    posted.set(key, held);
  }

  const watchers: PassiveWatcher[] = [...posted].flatMap(([id, force]) => {
    const radiusKm = detectionRangeOf(force.roles, theatre);
    return radiusKm <= 0
      ? []
      : [
          {
            id: `troop:${id}`,
            point: force.point,
            radiusKm,
            playerId: force.playerId,
            detector: 'troop' as const,
            detectorId: null,
            detectorHostCountry: force.detectorHostCountry,
            detectorRegion: force.detectorRegion,
          },
        ];
  });

  /** A post with no coal hears nothing (ADR 0028 §1): one economy read per owner, not per post. */
  const silent = new Map<Id<'players'>, boolean>();
  const isSilent = async (playerId: Id<'players'>): Promise<boolean> => {
    if (!silent.has(playerId)) {
      const economy = await economyOf(ctx, playerId, now);
      silent.set(playerId, economy.listeningSilent);
      // The coal is burning down: wake the ears at the instant it runs out, since nothing else will.
      const burning = !economy.listeningSilent && economy.ratePerHour.coal < 0;
      await keepDryWakeUp(
        ctx,
        playerById.get(playerId),
        burning
          ? now + (economy.stocks.coal / -economy.ratePerHour.coal) * 3_600_000 + 1_000
          : null,
      );
    }
    return silent.get(playerId)!;
  };

  for (const building of buildings) {
    if (building.key !== 'listening') continue;
    if (await isSilent(building.playerId)) continue;
    const facts = regionFacts(building.regionId);
    const point = pointOfBuilding(building);
    if (facts === null || point === null) continue;
    watchers.push({
      id: `station:${building._id}`,
      point,
      radiusKm: LISTENING_STATION_RADIUS_KM,
      playerId: building.playerId,
      detector: 'station',
      detectorId: building._id,
      detectorHostCountry: facts.country,
      detectorRegion: facts.name,
    });
  }

  for (const outpost of outposts) {
    if (outpost.specialization !== 'listening') continue;
    if (await isSilent(outpost.playerId)) continue;
    /** Un chantier n'écoute pas : le point n'existe pas encore (révision du 15/09). */
    if (!isStanding(outpost, now)) continue;
    if (outpost.disabledUntil !== null && outpost.disabledUntil > now) continue;
    watchers.push({
      id: `outpost:${outpost._id}`,
      point: pointOf(outpost.point),
      radiusKm: outpostReachKm(outpost.level),
      playerId: outpost.playerId,
      detector: 'outpost',
      detectorId: outpost._id,
      detectorHostCountry: outpost.hostCountry,
      detectorRegion: null,
    });
  }

  const mutualWindows = new Map<string, { readonly from: number; readonly to: number } | null>();
  return { mobileById, watchers, players, posted, allOnRangoonTour, mutualWindows };
}

type DetectionBoard = Awaited<ReturnType<typeof detectionBoard>>;

type CurrentDetector = { readonly point: LonLat; readonly radiusKm: number };

/**
 * **Une dernière position connue vieillit, elle ne s'éternise pas** (ADR 0024 §2). Le ménage se
 * fait ici parce que la réévaluation touche déjà ces deux index : un travail planifié pour
 * ramasser des souvenirs serait une horloge de plus dans un jeu qui n'en a pas.
 *
 * Un arc figé se reconnaît à son mouvement disparu — la ligne n'a plus rien à relire — et un camp
 * à sa fenêtre fermée. Les deux s'effacent au même délai : ce sont deux souvenirs de la même
 * sorte.
 */
async function forgetStaleSightings(
  ctx: MutationCtx,
  ledgers: ObserverLedgers,
  now: number,
): Promise<ReadonlyArray<Doc<'campSightings'>>> {
  const cutoff = now - LAST_KNOWN_HOURS * 3_600_000;
  for (const sighting of ledgers.frozen) {
    if (sighting.frozen!.closedAt <= cutoff) await deleteSighting(ctx, sighting);
  }
  const kept: Array<Doc<'campSightings'>> = [];
  for (const camp of ledgers.camps) {
    if (camp.until !== null && camp.until <= cutoff) await ctx.db.delete(camp._id);
    else kept.push(camp);
  }
  return kept;
}

/**
 * **Chaque registre d'observateur se lit une fois par réévaluation** (#145) : par joueur, sur son
 * propre index, puis rangé par mouvement. Une lecture par mouvement relisait les mêmes lignes une
 * seconde fois, et le ménage les relisait une troisième. Pour un événement d'un seul joueur, son
 * registre et les lignes tenues sur ses colonnes ; les camps, toujours en entier, puisqu'ils se
 * relisent en entier.
 */
async function observerLedgers(
  ctx: MutationCtx,
  board: DetectionBoard,
  movements: ReadonlyArray<Doc<'movements'>>,
  changed: Id<'players'> | undefined,
) {
  const sightings = new Map<Id<'sightings'>, Doc<'sightings'>>();
  const camps: Array<Doc<'campSightings'>> = [];
  for (const player of board.players) {
    if (changed === undefined || player._id === changed) {
      for (const sighting of await ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()) {
        sightings.set(sighting._id, sighting);
      }
    }
    camps.push(
      ...(await ctx.db
        .query('campSightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()),
    );
  }
  for (const movement of changed === undefined ? [] : movements) {
    if (movement.playerId !== changed) continue;
    for (const sighting of await ctx.db
      .query('sightings')
      .withIndex('byMovement', (q) => q.eq('movementId', movement._id))
      .collect()) {
      sightings.set(sighting._id, sighting);
    }
  }

  const sightingsByMovement = new Map<Id<'movements'>, Array<Doc<'sightings'>>>();
  const frozen: Array<Doc<'sightings'>> = [];
  for (const sighting of sightings.values()) {
    if (sighting.frozen !== undefined) frozen.push(sighting);
    const held = sightingsByMovement.get(sighting.movementId) ?? [];
    held.push(sighting);
    sightingsByMovement.set(sighting.movementId, held);
  }
  /** Dans l'ordre de l'index `byMovement`, que la synchronisation suivait. */
  for (const rows of sightingsByMovement.values()) {
    rows.sort((a, b) => a._creationTime - b._creationTime);
  }
  return { sightingsByMovement, frozen, camps };
}

type ObserverLedgers = Awaited<ReturnType<typeof observerLedgers>>;

/** Ce qui a pris le camp, et le peu que l'observateur en tire sur son propre plateau. */
type CampDetector = CurrentDetector & {
  readonly detector: Detector;
  readonly detectorId: Id<'buildings'> | Id<'outposts'> | null;
  readonly detectorHostCountry: string;
  readonly detectorRegion: string | null;
};

/**
 * **Une force posée se voit dans la portée** (ADR 0024 §1). Le jumeau immobile de `syncSightings`,
 * et il obéit aux mêmes deux règles : l'écriture est **événementielle** — la réévaluation relit le
 * plateau, la lecture ne filtre jamais rien — et la ligne appartient à un observateur, qui lit son
 * propre index (`brouillard-et-fanout.md`).
 *
 * Ce qui est relevé est une **position, un milieu et une date**. Ni la composition, ni l'effectif,
 * ni la nation : l'agent dormant garde son métier, qui est d'identifier et non de repérer.
 */
async function syncCampSightings(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  board: DetectionBoard,
  now: number,
  camps: ReadonlyArray<Doc<'campSightings'>>,
): Promise<void> {
  const detectors = new Map<Id<'players'>, CampDetector[]>();
  const watch = (playerId: Id<'players'>, detector: CampDetector) => {
    const held = detectors.get(playerId) ?? [];
    held.push(detector);
    detectors.set(playerId, held);
  };
  for (const watcher of board.watchers) {
    watch(watcher.playerId, {
      point: watcher.point,
      radiusKm: watcher.radiusKm,
      detector: watcher.detector,
      detectorId: watcher.detectorId,
      detectorHostCountry: watcher.detectorHostCountry,
      detectorRegion: watcher.detectorRegion,
    });
  }
  /** Une colonne en marche relève aussi — depuis l'endroit où elle se trouve **maintenant**,
   *  comme pour les caisses : un relevé est un état du plateau, pas une prédiction. */
  for (const mobile of board.mobileById.values()) {
    if (mobile.rangeKm <= 0) continue;
    const point = positionAt(mobile.force, now);
    watch(mobile.movement.playerId, {
      point,
      radiusKm: mobile.rangeKm,
      detector: 'troop',
      detectorId: null,
      detectorHostCountry: hostAtPoint(point),
      detectorRegion: null,
    });
  }

  /** **Le territoire n'a pas de rayon : c'est le sol** (fiche 04). Un camp planté chez moi est vu
   *  sans que rien de moi n'y soit posé. */
  const soils = new Map<string, Id<'players'>>();
  for (const player of board.players) {
    const home = homeCountryOf(player.nation);
    if (home !== null) soils.set(home, player._id);
  }

  const caughtBy = (
    playerId: Id<'players'>,
    point: LonLat,
    rangoonTour: boolean,
  ): CampDetector | null => {
    const home = soils.get(hostAmongCountries(point, new Set(soils.keys())));
    const found = (detectors.get(playerId) ?? []).filter(
      (detector) =>
        distanceKm(detector.point, point) <= sightingReachKm(detector.radiusKm, rangoonTour),
    );
    if (home === playerId) {
      found.push({
        point,
        radiusKm: 0,
        detector: 'territory',
        detectorId: null,
        detectorHostCountry: hostAtPoint(point),
        detectorRegion: null,
      });
    }
    /** Le même classement que le relevé d'un fil : ce qui est nommé est le premier détecteur de
     *  la fiche 04 qui couvre, jamais un appel de tous. */
    return (
      found.sort(
        (a, b) => DETECTOR_ORDER.indexOf(a.detector) - DETECTOR_ORDER.indexOf(b.detector),
      )[0] ?? null
    );
  };

  for (const player of board.players) {
    const rows = camps.filter((row) => row.playerId === player._id && row.seasonId === seasonId);
    const byStation = new Map(rows.map((row) => [row.stationKey, row]));

    for (const [stationKey, camp] of board.posted) {
      if (camp.playerId === player._id) continue;
      const caught = caughtBy(player._id, camp.point, board.allOnRangoonTour(camp.troopIds));
      const row = byStation.get(stationKey);
      if (caught === null) {
        if (row !== undefined && row.until === null) await ctx.db.patch(row._id, { until: now });
        continue;
      }
      const seen = {
        point: asPoint(camp.point),
        medium: landAtPoint(camp.point) ? ('land' as const) : ('sea' as const),
        until: null,
        detector: caught.detector,
        detectorId: caught.detectorId,
        detectorRegion: caught.detectorRegion,
      };
      if (row !== undefined) {
        /** Un camp qui n'a pas bougé sous le même détecteur ne se réécrit pas : la réévaluation
         *  passe à chaque départ et à chaque arrivée de la saison, et chaque écriture ici
         *  réveillait le plateau de l'observateur pour lui resservir la même ligne. */
        const unchanged =
          row.until === null &&
          row.point.lon === seen.point.lon &&
          row.point.lat === seen.point.lat &&
          row.medium === seen.medium &&
          row.detector === seen.detector &&
          row.detectorId === seen.detectorId &&
          row.detectorRegion === seen.detectorRegion;
        if (!unchanged) await ctx.db.patch(row._id, seen);
        continue;
      }
      await ctx.db.insert('campSightings', {
        playerId: player._id,
        seasonId,
        stationKey,
        ownerId: camp.playerId,
        since: now,
        noticeFiled: true,
        ...seen,
      });
      /** **Une fois par ligne, à l'ouverture** : une réouverture est le même camp retrouvé, et
       *  une seconde manchette pour lui ferait du journal un compteur de passages. */
      await ctx.db.insert('notices', {
        playerId: player._id,
        at: now,
        kind: 'campSighted',
        hostCountry: caught.detectorHostCountry,
        point: seen.point,
        detector: caught.detector,
        detectorRegion: caught.detectorRegion,
      });
    }

    /** La pile a levé le camp : la fenêtre se ferme, et le souvenir reste jusqu'au lot C. */
    for (const row of rows) {
      if (!board.posted.has(row.stationKey) && row.until === null) {
        await ctx.db.patch(row._id, { until: now });
      }
    }
  }
}

const emptyLoot = (): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((resource) => [resource, 0])) as Record<ResourceKey, number>;

async function syncLootCrateSightings(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  board: DetectionBoard,
  now: number,
): Promise<void> {
  const [crates, sightings] = await Promise.all([
    ctx.db
      .query('lootCrates')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect(),
    ctx.db
      .query('lootCrateSightings')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect(),
  ]);
  const detectors = new Map<Id<'players'>, CurrentDetector[]>();
  const addDetector = (playerId: Id<'players'>, detector: CurrentDetector) => {
    const held = detectors.get(playerId) ?? [];
    held.push(detector);
    detectors.set(playerId, held);
  };
  for (const watcher of board.watchers) {
    addDetector(watcher.playerId, { point: watcher.point, radiusKm: watcher.radiusKm });
  }
  for (const mobile of board.mobileById.values()) {
    if (mobile.rangeKm <= 0) continue;
    addDetector(mobile.movement.playerId, {
      point: positionAt(mobile.force, now),
      radiusKm: mobile.rangeKm,
    });
  }

  const covers = (playerId: Id<'players'>, point: LonLat): boolean =>
    (detectors.get(playerId) ?? []).some(
      (detector) => distanceKm(detector.point, point) <= detector.radiusKm,
    );
  const crateById = new Map(crates.map((crate) => [crate._id, crate]));
  const sightingsByCrate = new Map<Id<'lootCrates'>, Array<Doc<'lootCrateSightings'>>>();
  for (const sighting of sightings) {
    const held = sightingsByCrate.get(sighting.crateId) ?? [];
    held.push(sighting);
    sightingsByCrate.set(sighting.crateId, held);
  }

  for (const crate of crates) {
    const point = pointOf(crate.point);
    const existing = new Map(
      (sightingsByCrate.get(crate._id) ?? []).map((sighting) => [sighting.playerId, sighting]),
    );
    for (const player of board.players) {
      if (!covers(player._id, point)) continue;
      const sighting = existing.get(player._id);
      const value = {
        point: crate.point,
        loot: crate.loot,
        seenAt: now,
        present: true,
        current: true,
      };
      if (sighting === undefined) {
        await ctx.db.insert('lootCrateSightings', {
          seasonId,
          playerId: player._id,
          crateId: crate._id,
          ...value,
        });
      } else {
        await ctx.db.patch(sighting._id, value);
        existing.delete(player._id);
      }
    }
    for (const sighting of existing.values()) {
      if (sighting.current) await ctx.db.patch(sighting._id, { current: false });
    }
  }

  for (const sighting of sightings) {
    if (crateById.has(sighting.crateId)) continue;
    const point = pointOf(sighting.point);
    if (covers(sighting.playerId, point)) {
      await ctx.db.patch(sighting._id, {
        loot: emptyLoot(),
        seenAt: now,
        present: false,
        current: true,
      });
    } else if (sighting.current) {
      await ctx.db.patch(sighting._id, { current: false });
    }
  }
}

type DetectionTransition = { readonly kind: 'enter' | 'exit'; readonly at: number };

function nextLootCrateDetectionTransition(
  mobile: Mobile,
  cratePoint: LonLat,
  now: number,
): DetectionTransition | null {
  if (mobile.rangeKm <= 0) return null;
  const from = Math.max(now, mobile.force.departedAt);
  const to = mobile.force.arrivesAt;
  if (to <= from) return null;
  const insideAt = (at: number) =>
    distanceKm(positionAt(mobile.force, at), cratePoint) <= mobile.rangeKm;
  let previousAt = from;
  let previousInside = insideAt(from);

  for (let index = 1; index <= INTERCEPTION_SAMPLES; index += 1) {
    const at = from + ((to - from) * index) / INTERCEPTION_SAMPLES;
    const inside = insideAt(at);
    if (inside !== previousInside) {
      let lower = previousAt;
      let upper = at;
      for (let precision = 0; precision < 24; precision += 1) {
        const middle = (lower + upper) / 2;
        if (insideAt(middle) === previousInside) lower = middle;
        else upper = middle;
      }
      return { kind: inside ? 'enter' : 'exit', at: Math.max(now + 1, Math.ceil(upper)) };
    }
    previousAt = at;
    previousInside = inside;
  }
  return null;
}

/**
 * **Seules les dates qui bougent bougent** (#146). Chaque prédiction garde son job tant que sa
 * paire, son sens et son heure sont ceux de la nouvelle planche ; une autre est annulée et
 * recréée, une qui n'a plus lieu disparaît.
 */
async function rescheduleLootCrateDetectionJobs(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  board: DetectionBoard,
  now: number,
): Promise<void> {
  const previous = await ctx.db
    .query('lootCrateDetectionJobs')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  const kept = new Map<string, Doc<'lootCrateDetectionJobs'>>();
  const stale: Array<Doc<'lootCrateDetectionJobs'>> = [];
  for (const prediction of previous) {
    const key = `${prediction.movementId}|${prediction.crateId}`;
    if (kept.has(key)) stale.push(prediction);
    else kept.set(key, prediction);
  }

  const crates = await ctx.db
    .query('lootCrates')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  for (const mobile of board.mobileById.values()) {
    for (const crate of crates) {
      const key = `${mobile.movement._id}|${crate._id}`;
      const transition = nextLootCrateDetectionTransition(mobile, pointOf(crate.point), now);
      const current = kept.get(key);
      kept.delete(key);
      if (transition === null || transition.at >= crate.expiresAt) {
        if (current !== undefined) stale.push(current);
        continue;
      }
      if (
        current !== undefined &&
        current.kind === transition.kind &&
        current.at === transition.at &&
        (await isPending(ctx, current.scheduledJobId))
      )
        continue;
      if (current !== undefined) stale.push(current);
      const detectionJobId = await ctx.db.insert('lootCrateDetectionJobs', {
        seasonId,
        movementId: mobile.movement._id,
        crateId: crate._id,
        ...transition,
      });
      const scheduledJobId = await ctx.scheduler.runAt(
        transition.at,
        internal.lootCrates.refreshDetection,
        { detectionJobId, expectedAt: transition.at },
      );
      await ctx.db.patch(detectionJobId, { scheduledJobId });
    }
  }
  stale.push(...kept.values());
  for (const prediction of stale) {
    if (prediction.scheduledJobId !== undefined) await cancelJob(ctx, prediction.scheduledJobId);
    await ctx.db.delete(prediction._id);
  }
}

function stationOf(
  troop: Doc<'troops'>,
  players: ReadonlyMap<Id<'players'>, Doc<'players'>>,
  buildings: ReadonlyMap<Id<'buildings'>, Doc<'buildings'>>,
  outposts: ReadonlyMap<Id<'outposts'>, Doc<'outposts'>>,
): { point: LonLat; hostCountry: string; region: string | null } | null {
  const address = troop.stationedAt;
  if (address === null) {
    const player = players.get(troop.playerId);
    const capital =
      player === undefined || !isNation(player.nation)
        ? null
        : regionFacts(capitalRegionOf(player.nation));
    return capital === null
      ? null
      : { point: capital.point, hostCountry: capital.country, region: capital.name };
  }
  if (typeof address !== 'string') {
    const point = pointOf(address);
    return { point, hostCountry: hostAtPoint(point), region: null };
  }
  const outpost = outposts.get(address as Id<'outposts'>);
  if (outpost !== undefined) {
    return { point: pointOf(outpost.point), hostCountry: outpost.hostCountry, region: null };
  }
  const building = buildings.get(address as Id<'buildings'>);
  const facts = building === undefined ? null : regionFacts(building.regionId);
  const point = building === undefined ? null : pointOfBuilding(building);
  return facts === null || point === null
    ? null
    : { point, hostCountry: facts.country, region: facts.name };
}

/** What sees `target` pass — every player's detectors, or only those of `watchedBy`. */
async function sightingsFor(
  target: Mobile,
  board: Awaited<ReturnType<typeof detectionBoard>>,
  now: number,
  watchedBy: ReadonlySet<Id<'players'>> | null,
): Promise<ReadonlyArray<Caught>> {
  const caught: Caught[] = [];
  const watching = (playerId: Id<'players'>) =>
    playerId !== target.movement.playerId && (watchedBy === null || watchedBy.has(playerId));
  const watchers = board.watchers.flatMap((watcher) =>
    watching(watcher.playerId)
      ? [{ ...watcher, radiusKm: sightingReachKm(watcher.radiusKm, target.rangoonTour) }]
      : [],
  );
  for (const sighting of sightingsAlong({ mine: target.force, watchers, after: now })) {
    const watcher = watchers.find((candidate) => candidate.id === sighting.id);
    if (watcher !== undefined) caught.push({ ...watcher, from: sighting.from, to: sighting.to });
  }

  for (const observer of board.mobileById.values()) {
    if (!watching(observer.movement.playerId) || observer.rangeKm <= 0) continue;
    const window = mutualWindow(board, observer, target, now);
    if (window === null) continue;
    const point = positionAt(observer.force, window.from);
    caught.push({
      playerId: observer.movement.playerId,
      detector: 'troop',
      detectorId: null,
      detectorHostCountry: hostAtPoint(point),
      detectorRegion: null,
      ...window,
    });
  }

  caught.push(
    ...crossedSoil(
      target,
      board.players.filter((player) => watchedBy === null || watchedBy.has(player._id)),
      now,
    ),
  );
  return caught;
}

/**
 * **Deux colonnes au même rayon se voient pendant la même fenêtre** : la distance, le milieu et
 * l'intervalle commun ne dépendent pas de qui regarde. La fenêtre se calcule une fois par paire et
 * par rayon, et sert les deux sens quand ils lisent le même (#145) ; à rayons différents — ou
 * quand l'une est une tournée de Rangoun —, chacun garde la sienne.
 */
function mutualWindow(board: DetectionBoard, observer: Mobile, target: Mobile, now: number) {
  const radiusKm = sightingReachKm(observer.rangeKm, target.rangoonTour);
  const pair =
    observer.movement._id < target.movement._id
      ? `${observer.movement._id}|${target.movement._id}`
      : `${target.movement._id}|${observer.movement._id}`;
  const key = `${pair}|${radiusKm}`;
  if (board.mutualWindows.has(key)) return board.mutualWindows.get(key)!;
  const window = mobileSighting({
    observer: observer.force,
    target: target.force,
    radiusKm,
    after: now,
  });
  board.mutualWindows.set(key, window);
  return window;
}

function crossedSoil(
  target: Mobile,
  players: ReadonlyArray<Doc<'players'>>,
  now: number,
): ReadonlyArray<Caught> {
  const soils = new Map<string, Id<'players'>>();
  for (const player of players) {
    if (player._id === target.movement.playerId) continue;
    const home = homeCountryOf(player.nation);
    if (home !== null) soils.set(home, player._id);
  }
  /** La grille du trajet, rognée à l'instant, comme `sightingsAlong` (#145). */
  const from = target.force.departedAt;
  const span = target.force.arrivesAt - from;
  if (soils.size === 0 || span <= 0) return [];

  const countries = new Set(soils.keys());
  const windows = new Map<string, { from: number; to: number }>();
  for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
    const at = from + (index * span) / INTERCEPTION_SAMPLES;
    if (at < now) continue;
    const host = hostAmongCountries(positionAt(target.force, at), countries);
    if (host === '') continue;
    const held = windows.get(host);
    if (held === undefined) windows.set(host, { from: at, to: at });
    else held.to = at;
  }
  return [...windows].map(([hostCountry, window]) => ({
    playerId: soils.get(hostCountry)!,
    detector: 'territory' as const,
    detectorId: null,
    detectorHostCountry: hostCountry,
    detectorRegion: null,
    ...window,
  }));
}

async function syncSightings(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  candidates: ReadonlyArray<Caught>,
  now: number,
  rows: ReadonlyArray<Doc<'sightings'>>,
): Promise<void> {
  const desired = new Map<Id<'players'>, Caught>();
  for (const candidate of candidates) {
    const held = desired.get(candidate.playerId);
    if (held === undefined) desired.set(candidate.playerId, candidate);
    else {
      const first = earlier(held, candidate);
      desired.set(candidate.playerId, {
        ...first,
        from: Math.min(held.from, candidate.from),
        to: Math.max(held.to, candidate.to),
      });
    }
  }

  const byPlayer = new Map<Id<'players'>, Array<Doc<'sightings'>>>();
  for (const row of rows) {
    const kept = byPlayer.get(row.playerId) ?? [];
    kept.push(row);
    byPlayer.set(row.playerId, kept);
  }

  for (const [playerId, held] of byPlayer) {
    const [row, ...duplicates] = held.sort((a, b) => a._creationTime - b._creationTime);
    for (const duplicate of duplicates) await deleteSighting(ctx, duplicate);
    if (row === undefined) continue;
    const next = desired.get(playerId);
    desired.delete(playerId);
    if (next === undefined) {
      if (row.from > now) await deleteSighting(ctx, row);
      else if (row.to > now) await ctx.db.patch(row._id, { to: now });
      continue;
    }
    await replaceSighting(ctx, row, next, now);
  }

  for (const sighting of desired.values()) await insertSighting(ctx, movement._id, sighting, now);
}

const earlier = (held: Caught, sighting: Caught): Caught =>
  sighting.from < held.from ||
  (sighting.from === held.from &&
    DETECTOR_ORDER.indexOf(sighting.detector) < DETECTOR_ORDER.indexOf(held.detector))
    ? sighting
    : held;

async function replaceSighting(
  ctx: MutationCtx,
  row: Doc<'sightings'>,
  next: Caught,
  now: number,
): Promise<void> {
  if (row.from <= now) {
    if (next.to > row.to) await ctx.db.patch(row._id, { to: next.to });
    return;
  }
  /** La grille ne bouge plus avec l'instant (#145) : une fenêtre future relue telle quelle garde
   *  sa ligne et son rendez-vous, sans réécriture ni job replanifié. */
  const fields = sightingFields(next);
  if (
    (row.revealJobId !== undefined || row.noticeFiled === true) &&
    (Object.keys(fields) as Array<keyof typeof fields>).every((key) => row[key] === fields[key])
  ) {
    return;
  }
  if (row.revealJobId !== undefined) await cancelJob(ctx, row.revealJobId);
  await ctx.db.patch(row._id, {
    ...sightingFields(next),
    revealJobId: undefined,
    ...(row.noticeFiled === undefined && row.revealJobId === undefined
      ? { noticeFiled: true }
      : {}),
  });
  if (next.from <= now) await revealSighting(ctx, row._id, now);
  else if (row.noticeFiled !== true && row.revealJobId !== undefined) {
    await scheduleReveal(ctx, row._id, next.from);
  }
}

async function insertSighting(
  ctx: MutationCtx,
  movementId: Id<'movements'>,
  sighting: Caught,
  now: number,
): Promise<void> {
  const owner = (await ctx.db.get(movementId))?.playerId;
  const sightingId = await ctx.db.insert('sightings', {
    movementId,
    ...(owner === undefined ? {} : { ownerId: owner }),
    ...sightingFields(sighting),
  });
  if (sighting.from <= now) await revealSighting(ctx, sightingId, now);
  else await scheduleReveal(ctx, sightingId, sighting.from);
}

const sightingFields = (sighting: Caught) => ({
  playerId: sighting.playerId,
  from: sighting.from,
  to: sighting.to,
  detector: sighting.detector,
  detectorId: sighting.detectorId,
  detectorHostCountry: sighting.detectorHostCountry,
  detectorRegion: sighting.detectorRegion,
});

async function scheduleReveal(
  ctx: MutationCtx,
  sightingId: Id<'sightings'>,
  at: number,
): Promise<void> {
  const revealJobId = await ctx.scheduler.runAt(at, internal.movements.revealSighting, {
    sightingId,
  });
  await ctx.db.patch(sightingId, { revealJobId });
}

async function deleteSighting(ctx: MutationCtx, sighting: Doc<'sightings'>): Promise<void> {
  if (sighting.revealJobId !== undefined) await cancelJob(ctx, sighting.revealJobId);
  await ctx.db.delete(sighting._id);
}
