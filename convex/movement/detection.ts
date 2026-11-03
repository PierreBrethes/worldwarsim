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
  lineCrossingOf,
  mobileSighting,
  positionAt,
  passesAlong,
  type MarchingForce,
  type Watcher,
} from '../../src/domain/interception';
import { seenSegment } from '../../src/domain/sighting-segment';
import {
  gridStepOf,
  nextOpening,
  prunedWindows,
  relaidWindows,
  sameWindows,
  storedWindows,
  windowsOf,
  type SightWindow,
} from '../../src/domain/sighting-windows';
import { RESOURCES, type ResourceKey, type UnitRole } from '../../src/domain/ids';
import { isNation } from '../../src/domain/nations';
import {
  effectiveSpecialty,
  fortWatches,
  isStanding,
  lookoutKmOf,
  readsComposition,
  drawnLiaisonsOf,
  sameLiaison,
} from '../../src/domain/outposts';
import {
  campReading,
  columnReading,
  lostReading,
  mergeWindows,
  readingTransition,
  type ReadWindow,
  type Reading,
} from '../../src/domain/lookout-reading';
import { seasonBuildings } from '../buildingReads';
import { cancelJob, isPending } from '../scheduledJobs';
import { coalDryAt, economyOf, keepDryWakeUp, keepSilence } from '../resources';
import { holdsPoint } from '../strategicPoints';
import { isRangoonColumn } from '../../src/domain/strategic-points';
import {
  detectionRangeOf,
  LAST_KNOWN_HOURS,
  LISTENING_STATION_RADIUS_KM,
  sightingReachKm,
} from '../constants';
import { seasonTheatre } from './theatre';
import { capitalRegionOf, homeCountryOf, pointOfBuilding, regionFacts } from '../regions';
import { hostAmongCountries, hostAtPoint, landAtPoint } from '../routes';
import { asPoint, pointOf, seasonMovements, seasonOutposts, seasonTroops } from './forces';
import { everySeatOf } from '../seats';
import { reassessForts, type Fort } from './fort';
import { liaisonPointsAmong } from './pace';
import { notifyPlayer } from '../notifications';
import { journalUrl, push } from '../../src/domain/push';

type Mobile = {
  readonly movement: Doc<'movements'>;
  readonly force: MarchingForce;
  readonly rangeKm: number;
  /** **Rangoun** : une tournée de son teneur, que chaque détecteur ne relève qu'à sa part. */
  readonly rangoonTour: boolean;
  /** Ce qu'un Guet en lit : un rôle par troupe, trié (ADR 0037 §5). */
  readonly roles: ReadonlyArray<UnitRole>;
};

const DETECTOR_ORDER = ['territory', 'station', 'outpost', 'patrol', 'troop'] as const;
type Detector = (typeof DETECTOR_ORDER)[number];

type Caught = {
  readonly playerId: Id<'players'>;
  readonly detector: Detector;
  readonly detectorId: Id<'buildings'> | Id<'outposts'> | null;
  readonly detectorHostCountry: string;
  readonly detectorRegion: string | null;
  /** **Ce que ce détecteur voit**, une fenêtre par passage, dans l'ordre (#412). */
  readonly windows: ReadonlyArray<SightWindow>;
  /** **Les fenêtres de Guet** (ADR 0037 §5), ouvertes à l'instant si un Guet voit déjà la
   *  colonne ; aucune pour tout autre détecteur. */
  readonly readWindows: ReadonlyArray<ReadWindow>;
  /** **Les franchissements de lignes de guet à venir** (#377), un par ronde : chacun sa dépêche,
   *  même sur une colonne déjà relevée (Décisions du 02/11). */
  readonly crossings?: ReadonlyArray<Crossing>;
};

type Crossing = {
  readonly troopId: Id<'troops'>;
  readonly at: number;
  readonly point: { readonly lon: number; readonly lat: number };
};

type PassiveWatcher = Watcher &
  Omit<Caught, 'windows' | 'readWindows'> & {
    /** Un Guet : ses relevés livrent la pile (`readsComposition`). */
    readonly reads: boolean;
  };

/**
 * Replaces every prediction affected by the current board. It is called only from mutations that
 * changed a route, a manifest or a detector; no query and no periodic loop enters here.
 *
 * **`changed` : l'événement ne touche qu'un joueur** (#145), ou quelques-uns. Un départ, une
 * arrivée sans combat, un pas de tournée ou une recrue ne changent que les détecteurs de leur
 * joueur — la pile quittée ou rejointe, la colonne née ou finie — et ses propres colonnes comme
 * cibles ; la chute d'un QG, ceux du capteur, du vaincu et du siège irrégulier (#171). Refaire
 * leurs relevés à eux et ceux qu'on tient sur leurs colonnes rend exactement ce que rendrait la
 * réévaluation complète : rien d'autre sur le plateau n'a bougé, et la grille d'échantillons ne
 * bouge pas avec l'instant (`mobileSighting`). Recroiser chaque
 * colonne avec chaque autre à chaque départ dépassait la seconde d'une mutation passé quarante
 * colonnes. Les camps, les caisses et les captures se relisent toujours en entier : ils lisent la
 * position présente de toutes les colonnes, et ils coûtent peu.
 */
export async function reassessDetection(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now = Date.now(),
  changed?: Id<'players'> | ReadonlyArray<Id<'players'>>,
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null) return;
  const touched = changed === undefined ? null : new Set([changed].flat());

  const movements = await seasonMovements(ctx, seasonId);

  const active =
    season.status === 'launched' && season.concludedAt === null
      ? movements.filter((movement) => movement.arrivesAt > now)
      : [];
  const board = await detectionBoard(ctx, seasonId, active, now, touched);
  /** **Le rendez-vous au Fort avant les relevés** : un relevé qui s'ouvre tout de suite (une
   *  colonne partie dans la vigie) doit trouver l'entrée posée, sinon il part en dépêche à côté de
   *  celle du Fort (`heldByFort`). */
  await reassessForts(ctx, board, now);
  const ledgers = await observerLedgers(ctx, board, movements, touched);

  for (const target of movements) {
    const watchedBy = touched === null || touched.has(target.playerId) ? null : touched;
    const mobile = board.mobileById.get(target._id);
    const desired = mobile === undefined ? [] : sightingsFor(mobile, board, now, watchedBy);
    await syncSightings(
      ctx,
      target,
      await desired,
      now,
      ledgers.sightingsByMovement.get(target._id) ?? [],
      mobile?.roles ?? [],
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
  /** **Le franchissement dit la dépêche lui-même** (`fileCrossing`), même quand il ouvre la
   *  ligne : une seule voix pour une ronde, quelle que soit la place du franchissement. */
  if (sighting.detector === 'patrol' || (await heldByFort(ctx, sighting, movement))) {
    await ctx.db.patch(sighting._id, { noticeFiled: true, revealJobId: undefined });
    return;
  }

  /** **La première fenêtre, jamais l'enveloppe** (#412) : le cap au bout de l'enveloppe serait
   *  celui d'après le trou, que personne n'a vu. */
  const first = windowsOf(sighting)[0]!;
  const seen = seenSegment(marchingForce(movement), first.from, first.to);
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

/**
 * **Le relevé qu'ouvre la retenue d'un Fort part avec sa dépêche** (ADR 0037 §6) : le défenseur
 * reçoit une seule dépêche, `fortHeld`, qui porte le relevé. La fenêtre s'ouvre au rendez-vous
 * pas encore tenu, ou au plus tard à la reprise ; les deux jobs tombent à la même heure, dans un
 * ordre que rien ne garantit.
 */
async function heldByFort(
  ctx: MutationCtx,
  sighting: Doc<'sightings'>,
  movement: Doc<'movements'>,
): Promise<boolean> {
  if (sighting.detector !== 'outpost' || sighting.detectorId === null) return false;
  const opensTheHold =
    movement.fortEntry?.at === sighting.from ||
    (movement.resumed !== undefined && sighting.from <= movement.resumed.at);
  if (!opensTheHold) return false;
  const outpost = await ctx.db.get(sighting.detectorId as Id<'outposts'>);
  return outpost !== null && effectiveSpecialty(outpost) === 'fort';
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
  ...(movement.resumed === undefined ? {} : { resumed: movement.resumed }),
  ...(movement.heldAt === undefined ? {} : { heldAt: movement.heldAt }),
});

async function detectionBoard(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  movements: ReadonlyArray<Doc<'movements'>>,
  now: number,
  /** The players whose economy this event may have moved; `null` reads every verdict off its row. */
  touched: ReadonlySet<Id<'players'>> | null = null,
) {
  const theatre = seasonTheatre(await ctx.db.get(seasonId));
  const [troops, buildings, outposts, players] = await Promise.all([
    seasonTroops(ctx, seasonId),
    seasonBuildings(ctx, seasonId),
    seasonOutposts(ctx, seasonId),
    everySeatOf(ctx, seasonId),
  ]);
  const troopById = new Map(troops.map((troop) => [troop._id, troop]));
  /** **Rangoun** : les tournées de son teneur ne se relèvent qu'à la part de portée de
   *  `sightingReachKm`. Relu ici à chaque réévaluation, donc éteint dès que le point change de
   *  main (`handOver` réévalue s'il y a une tournée chez l'un des teneurs). */
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
  const allOnRangoonTour = (troopIds: ReadonlyArray<Id<'troops'>>) =>
    isRangoonColumn(troopIds, (id) => rangoonTours.has(id));
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
      roles: roles.sort(),
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
            reads: false,
          },
        ];
  });

  /**
   * **A post with no coal hears nothing** (ADR 0028 §1, ADR 0037 §2). Only a player this event
   * touched has his economy settled here, once, and his verdict written on his row when it
   * changes; every other player is read off that row (`players.listeningSilent`), which his own
   * events keep: the wake-up at the instant his coal runs dry and the one his settlements post
   * (`listening.reassess`, `writeStocks`). Settling every owner of a lookout on every departure
   * would cost the whole board for one column.
   */
  const silent = new Map<Id<'players'>, boolean>();
  const isSilent = async (playerId: Id<'players'>): Promise<boolean> => {
    const player = playerById.get(playerId);
    /** The irregular seat keeps no stock, so the stations it inherits at a fall have no coal. */
    if (player?.irregular === true) return true;
    if (touched === null || !touched.has(playerId)) return player?.listeningSilent === true;
    if (!silent.has(playerId)) {
      const economy = await economyOf(ctx, playerId, now);
      silent.set(playerId, economy.listeningSilent);
      await keepSilence(ctx, player, economy.listeningSilent);
      await keepDryWakeUp(ctx, player, coalDryAt(economy, economy.stocks.coal, now));
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
      reads: false,
    });
  }

  /** **Les Forts qui retiennent** (ADR 0037 §6) : ceux qui guettent, rien de plus. */
  const forts: Fort[] = [];
  /** **Tout avant-poste debout guette** (ADR 0037 §1, §2), à mi-rayon, sur le charbon national. */
  for (const outpost of outposts) {
    /** Un chantier ne guette pas : le point n'existe pas encore (révision du 15/09). */
    if (!isStanding(outpost, now)) continue;
    if (outpost.disabledUntil !== null && outpost.disabledUntil > now) continue;
    const silent = await isSilent(outpost.playerId);
    if (fortWatches(outpost, now, silent))
      forts.push({
        id: outpost._id,
        point: pointOf(outpost.point),
        radiusKm: lookoutKmOf(outpost),
        playerId: outpost.playerId,
      });
    if (silent) continue;
    watchers.push({
      id: `outpost:${outpost._id}`,
      point: pointOf(outpost.point),
      radiusKm: lookoutKmOf(outpost),
      playerId: outpost.playerId,
      detector: 'outpost',
      detectorId: outpost._id,
      detectorHostCountry: outpost.hostCountry,
      detectorRegion: null,
      reads: readsComposition(outpost),
    });
  }

  const mutualWindows = new Map<string, { readonly from: number; readonly to: number } | null>();
  return {
    mobileById,
    watchers,
    lines: watchLinesOf(troops, outposts, now),
    forts,
    players,
    posted,
    allOnRangoonTour,
    mutualWindows,
  };
}

/**
 * **Les lignes de guet** (ADR 0037 §10, #377) : une par ronde dont la liaison tient à l'instant —
 * ses deux bouts à son joueur, debout, en service, et la paire tracée (`drawnLiaisonsOf`), lue sur
 * les avant-postes déjà chargés. Hors de `watchers`, que camps et caisses lisent comme des cercles.
 * Ni charbon ni Blitz : une troupe relève sans charbon, et la ronde est refusée en Blitz.
 */
function watchLinesOf(
  troops: ReadonlyArray<Doc<'troops'>>,
  outposts: ReadonlyArray<Doc<'outposts'>>,
  now: number,
) {
  const patrols = troops.filter((troop) => troop.patrol !== undefined);
  if (patrols.length === 0) return [];
  const pointById = new Map(outposts.map((outpost) => [outpost._id, pointOf(outpost.point)]));
  const drawn = new Map<Id<'players'>, Array<[Id<'outposts'>, Id<'outposts'>]>>();
  return patrols.flatMap((troop) => {
    const [a, b] = troop.patrol!.ends as [Id<'outposts'>, Id<'outposts'>];
    if (!drawn.has(troop.playerId)) {
      const mine = outposts.filter((outpost) => outpost.playerId === troop.playerId);
      drawn.set(troop.playerId, drawnLiaisonsOf(liaisonPointsAmong(mine, now)));
    }
    return drawn.get(troop.playerId)!.some((pair) => sameLiaison(pair, [a, b]))
      ? [
          {
            troopId: troop._id,
            playerId: troop.playerId,
            line: [pointById.get(a)!, pointById.get(b)!] as const,
          },
        ]
      : [];
  });
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
 * seconde fois, et le ménage les relisait une troisième. Pour un événement de quelques joueurs, leurs
 * registres et les lignes tenues sur leurs colonnes ; les camps, toujours en entier, puisqu'ils se
 * relisent en entier.
 */
async function observerLedgers(
  ctx: MutationCtx,
  board: DetectionBoard,
  movements: ReadonlyArray<Doc<'movements'>>,
  touched: ReadonlySet<Id<'players'>> | null,
) {
  const sightings = new Map<Id<'sightings'>, Doc<'sightings'>>();
  const camps: Array<Doc<'campSightings'>> = [];
  for (const player of board.players) {
    if (touched === null || touched.has(player._id)) {
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
  for (const movement of movements) {
    if (touched === null || !touched.has(movement.playerId)) continue;
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
  readonly reads: boolean;
};

/**
 * **Une force posée se voit dans la portée** (ADR 0024 §1). Le jumeau immobile de `syncSightings`,
 * et il obéit aux mêmes deux règles : l'écriture est **événementielle** — la réévaluation relit le
 * plateau, la lecture ne filtre jamais rien — et la ligne appartient à un observateur, qui lit son
 * propre index (`brouillard-et-fanout.md`).
 *
 * Ce qui est relevé est une **position, un milieu et une date**. Ni l'effectif, ni la nation :
 * l'agent dormant garde son métier, qui est d'identifier et non de repérer. La pile, seulement
 * sous un Guet (ADR 0037 §5) : seul un Guet l'écrit, il la récrit tant qu'il voit, et elle reste
 * la dernière lue quand il la perd.
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
      reads: watcher.reads,
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
      reads: false,
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
  ): { readonly first: CampDetector; readonly reads: boolean } | null => {
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
        reads: false,
      });
    }
    /** Le même classement que le relevé d'un fil : ce qui est nommé est le premier détecteur de
     *  la fiche 04 qui couvre, jamais un appel de tous. La pile, elle, se lit sur tous : nommer
     *  la station ne doit pas rater le Guet qui la double. */
    const first = found.sort(
      (a, b) => DETECTOR_ORDER.indexOf(a.detector) - DETECTOR_ORDER.indexOf(b.detector),
    )[0];
    return first === undefined ? null : { first, reads: found.some((detector) => detector.reads) };
  };

  /** **La garnison d'un objectif ne se lit pas** (`WWS/CONTEXT.md`, « la composition, jamais ») :
   *  le siège irrégulier ne se lit nulle part. */
  const irregular = new Set(
    board.players.flatMap((player) => (player.irregular === true ? [player._id] : [])),
  );
  /** Une ligne qui se ferme fige sa pile, datée de l'instant (`lostReading`). */
  const close = (row: Doc<'campSightings'>) =>
    ctx.db.patch(row._id, { until: now, ...campPatch(row, lostReading(row, now)) });

  for (const player of board.players) {
    const rows = camps.filter((row) => row.playerId === player._id && row.seasonId === seasonId);
    const byStation = new Map(rows.map((row) => [row.stationKey, row]));

    for (const [stationKey, camp] of board.posted) {
      if (camp.playerId === player._id) continue;
      const sighted = caughtBy(player._id, camp.point, board.allOnRangoonTour(camp.troopIds));
      const row = byStation.get(stationKey);
      if (sighted === null) {
        if (row !== undefined && row.until === null) await close(row);
        continue;
      }
      const caught = sighted.first;
      const reading = campReading(
        row,
        sighted.reads && !irregular.has(camp.playerId),
        [...camp.roles].sort(),
        now,
      );
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
        const patch = { ...(unchanged ? {} : seen), ...campPatch(row, reading) };
        if (Object.keys(patch).length > 0) await ctx.db.patch(row._id, patch);
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
        ...(reading.stack === undefined ? {} : { stack: [...reading.stack] }),
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
      if (!board.posted.has(row.stationKey) && row.until === null) await close(row);
    }
  }
}

/** Ce qui change de la lecture, et seulement ça : une clé absente de `next` s'efface. */
function readingPatch(
  row: Reading,
  next: Reading,
): {
  reads?: Array<{ from: number; to: number }> | undefined;
  readAt?: number | undefined;
  stack?: Array<UnitRole> | undefined;
} {
  const patch: ReturnType<typeof readingPatch> = {};
  if (row.readAt !== next.readAt) patch.readAt = next.readAt;
  const windows = (reading: Reading) =>
    reading.reads?.map((window) => `${window.from}-${window.to}`).join();
  if (windows(row) !== windows(next)) {
    patch.reads = next.reads?.map((window) => ({ from: window.from, to: window.to }));
  }
  if (row.stack?.join() !== next.stack?.join()) {
    patch.stack = next.stack === undefined ? undefined : [...next.stack];
  }
  return patch;
}

/** Un camp n'a pas de fenêtre à venir : sa lecture est sa pile et sa date. */
const campPatch = (row: Reading, next: Reading) => {
  const { reads: _reads, ...patch } = readingPatch(row, next);
  return patch;
};

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
  /** Un passage par entrée dans chaque cercle : la ligne relève chaque passage, une fenêtre
   *  chacun (#412), et le Guet ne lit que dans ses passages (ADR 0037 §5). */
  const passes = new Map<string, Array<{ from: number; to: number }>>();
  for (const pass of passesAlong({ mine: target.force, watchers, after: now })) {
    const held = passes.get(pass.id) ?? [];
    held.push({ from: pass.from, to: pass.to });
    passes.set(pass.id, held);
  }
  let here: LonLat | null = null;
  for (const [id, seen] of passes) {
    const watcher = watchers.find((candidate) => candidate.id === id);
    if (watcher === undefined) continue;
    /** La grille du trajet place le passage en cours au prochain échantillon : un Guet qui voit
     *  la colonne à l'instant la lit à l'instant. */
    here ??= watcher.reads ? positionAt(target.force, now) : null;
    const readWindows = !watcher.reads
      ? []
      : seen.map((pass, index) =>
          index === 0 && distanceKm(here!, watcher.point) <= watcher.radiusKm
            ? { from: now, to: pass.to }
            : pass,
        );
    caught.push({ ...watcher, windows: seen, readWindows });
  }

  /** **Une ligne de guet relève au franchissement** (ADR 0037 §10), terre, mer et air, sans lire
   *  la pile : un instant, au point où la colonne passe. */
  for (const { troopId, playerId, line } of board.lines) {
    if (!watching(playerId)) continue;
    const crossing = lineCrossingOf(target.force, line, now);
    if (crossing === null) continue;
    const [lon, lat] = crossing.point;
    caught.push({
      crossings: [{ troopId, at: crossing.at, point: { lon, lat } }],
      playerId,
      detector: 'patrol',
      detectorId: null,
      detectorHostCountry: hostAtPoint(crossing.point),
      detectorRegion: null,
      readWindows: [],
      windows: [{ from: crossing.at, to: crossing.at }],
    });
  }

  for (const observer of board.mobileById.values()) {
    if (!watching(observer.movement.playerId) || observer.rangeKm <= 0) continue;
    /** **Colonne contre colonne, l'enveloppe est admise** (#412, Décisions du 03/11) : deux
     *  colonnes qui se croisent, s'écartent et se recroisent sont un cas rare, et `mobileSighting`
     *  n'en rend qu'une fenêtre. */
    const window = mutualWindow(board, observer, target, now);
    if (window === null) continue;
    const point = positionAt(observer.force, window.from);
    caught.push({
      playerId: observer.movement.playerId,
      detector: 'troop',
      detectorId: null,
      detectorHostCountry: hostAtPoint(point),
      detectorRegion: null,
      readWindows: [],
      windows: [window],
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
  /** Un passage par séjour sur le sol : le quitter puis le reprendre laisse un trou (#412). */
  const windows = new Map<string, Array<{ from: number; to: number }>>();
  let previous = '';
  for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
    const at = from + (index * span) / INTERCEPTION_SAMPLES;
    if (at < now) continue;
    const host = hostAmongCountries(positionAt(target.force, at), countries);
    if (host !== '') {
      const held = windows.get(host) ?? [];
      if (host === previous) held[held.length - 1]!.to = at;
      else held.push({ from: at, to: at });
      windows.set(host, held);
    }
    previous = host;
  }
  return [...windows].map(([hostCountry, seen]) => ({
    playerId: soils.get(hostCountry)!,
    detector: 'territory' as const,
    detectorId: null,
    detectorHostCountry: hostCountry,
    detectorRegion: null,
    readWindows: [],
    windows: seen,
  }));
}

async function syncSightings(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  candidates: ReadonlyArray<Caught>,
  now: number,
  rows: ReadonlyArray<Doc<'sightings'>>,
  roles: ReadonlyArray<UnitRole>,
): Promise<void> {
  /** **Seul le premier franchissement d'une ligne relève** (#377) : passé, la ligne ne rend plus
   *  que le suivant, et l'étendre jusque-là servirait l'aller et le retour que personne n'a vus. */
  const crossed = new Set(
    rows.flatMap((row) =>
      (row.crossings ?? []).flatMap(({ troopId, at }) => (at <= now ? [troopId] : [])),
    ),
  );
  /** **Deux détecteurs, deux fenêtres** (#412) : jointes seulement quand elles se touchent à un
   *  pas de grille près, jamais leur enveloppe — elle servirait le trou que personne n'a vu. */
  const step = gridStepOf(movement);
  const desired = new Map<Id<'players'>, Caught>();
  for (const candidate of candidates) {
    const line = candidate.detector === 'patrol' ? candidate.crossings?.[0] : undefined;
    if (line !== undefined && crossed.has(line.troopId)) continue;
    const held = desired.get(candidate.playerId);
    if (held === undefined) desired.set(candidate.playerId, candidate);
    else {
      const first = earlier(held, candidate);
      desired.set(candidate.playerId, {
        ...first,
        windows: mergeWindows([...held.windows, ...candidate.windows], step),
        readWindows: [...held.readWindows, ...candidate.readWindows],
        crossings: [...(held.crossings ?? []), ...(candidate.crossings ?? [])],
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
    if (next === undefined && row.from > now) await deleteSighting(ctx, row);
    else await replaceSighting(ctx, row, next, now, roles, step);
  }

  for (const sighting of desired.values()) {
    await insertSighting(ctx, movement._id, sighting, now, roles);
  }
}

/**
 * **Le réveil d'une réapparition** (#412) : un job à la prochaine ouverture d'une fenêtre après la
 * première, que la dépêche (`revealJobId`) réveille déjà. Gardé si l'heure ne change pas, annulé
 * puis replanifié sinon. Rend le patch, vide si rien ne change.
 */
async function keepOpenJob(
  ctx: MutationCtx,
  row: {
    readonly _id: Id<'sightings'>;
    readonly openJobId?: Id<'_scheduled_functions'> | undefined;
    readonly openJobAt?: number | undefined;
  },
  from: number,
  windows: ReadonlyArray<SightWindow>,
  now: number,
): Promise<{ openJobId?: Id<'_scheduled_functions'> | undefined; openJobAt?: number | undefined }> {
  const at = nextOpening(windows, Math.max(now, from));
  if (row.openJobId !== undefined && row.openJobAt === at) return {};
  if (row.openJobId !== undefined) await cancelJob(ctx, row.openJobId);
  if (at === null) {
    return row.openJobId === undefined ? {} : { openJobId: undefined, openJobAt: undefined };
  }
  const openJobId = await ctx.scheduler.runAt(at, internal.movements.wakeSighting, {
    sightingId: row._id,
    expectedAt: at,
  });
  return { openJobId, openJobAt: at };
}

/** **La colonne reparaît** : la fenêtre d'avant s'élague, la vue se relit, et le réveil suivant
 *  se pose. Ni dépêche ni push : la ligne n'en a qu'une, à sa première ouverture. Un job périmé
 *  ne fait rien. */
export async function wakeSighting(
  ctx: MutationCtx,
  sightingId: Id<'sightings'>,
  expectedAt: number,
  now = Date.now(),
): Promise<void> {
  const row = await ctx.db.get(sightingId);
  if (row === null || row.frozen !== undefined || now < expectedAt || row.openJobAt !== expectedAt)
    return;
  const windows = prunedWindows(windowsOf(row), now);
  const job = await keepOpenJob(
    ctx,
    { ...row, openJobId: undefined, openJobAt: undefined },
    row.from,
    windows,
    now,
  );
  await ctx.db.patch(row._id, {
    windows: storedWindows(row.from, windows),
    openJobId: job.openJobId,
    openJobAt: job.openJobAt,
  });
}

/**
 * **La lecture d'une ligne et son réveil** (ADR 0037 §5) : le patch de ce qui change, et le job
 * de la prochaine borne de ses fenêtres de Guet — une ouverture ou une fin. Une vue en cache ne
 * relit pas l'heure : sans ce réveil, la pile n'apparaîtrait qu'à la prochaine écriture sans
 * rapport. Un job n'est gardé que s'il vise la borne que la lecture nouvelle attend.
 */
async function writeReading(
  ctx: MutationCtx,
  row: {
    readonly _id: Id<'sightings'>;
    readonly readJobId?: Id<'_scheduled_functions'> | undefined;
    readonly readJobAt?: number | undefined;
  } & Reading,
  next: Reading,
  now: number,
): Promise<
  ReturnType<typeof readingPatch> & {
    readJobId?: Id<'_scheduled_functions'> | undefined;
    readJobAt?: number | undefined;
  }
> {
  const patch = readingPatch(row, next);
  const at = readingTransition(next, now);
  /** Le job d'une ligne la réécrit quand il court : tant qu'il y est noté, il attend encore. Le
   *  relire au système coûterait une lecture par ligne et par réévaluation. */
  if (row.readJobId !== undefined && row.readJobAt === at) return patch;
  if (row.readJobId !== undefined) await cancelJob(ctx, row.readJobId);
  if (at === null) {
    return row.readJobId === undefined
      ? patch
      : { ...patch, readJobId: undefined, readJobAt: undefined };
  }
  const readJobId = await ctx.scheduler.runAt(at, internal.listening.readPile, {
    sightingId: row._id,
    expectedAt: at,
  });
  return { ...patch, readJobId, readJobAt: at };
}

/** **Le réveil d'une borne de Guet** : la pile se lit à l'ouverture et se fige à la fin. Un job
 *  périmé — la fenêtre a bougé depuis — ne fait rien. */
export async function readPile(
  ctx: MutationCtx,
  sightingId: Id<'sightings'>,
  expectedAt: number,
  now = Date.now(),
): Promise<void> {
  const row = await ctx.db.get(sightingId);
  if (row === null || now < expectedAt || row.readJobAt !== expectedAt) return;
  const movement = row.frozen === undefined ? await ctx.db.get(row.movementId) : null;
  if (movement === null) return;
  const roles = (await Promise.all(movement.troopIds.map((id) => ctx.db.get(id))))
    .flatMap((troop) => (troop === null ? [] : [troop.role]))
    .sort();
  const { readJobId, readJobAt, ...patch } = await writeReading(
    ctx,
    { ...row, readJobId: undefined, readJobAt: undefined },
    columnReading(row, row.reads ?? [], roles, now),
    now,
  );
  await ctx.db.patch(row._id, { ...patch, readJobId, readJobAt });
}

const earlier = (held: Caught, sighting: Caught): Caught =>
  sighting.windows[0]!.from < held.windows[0]!.from ||
  (sighting.windows[0]!.from === held.windows[0]!.from &&
    DETECTOR_ORDER.indexOf(sighting.detector) < DETECTOR_ORDER.indexOf(held.detector))
    ? sighting
    : held;

async function replaceSighting(
  ctx: MutationCtx,
  row: Doc<'sightings'>,
  next: Caught | undefined,
  now: number,
  roles: ReadonlyArray<UnitRole>,
  step: number,
): Promise<void> {
  const reading = await writeReading(
    ctx,
    row,
    columnReading(row, next?.readWindows ?? [], roles, now),
    now,
  );
  const crossings = await keepCrossings(ctx, row, next?.crossings ?? [], now);
  if (row.from <= now) {
    /** **Le passé reste ce qu'il a été vu** : la fenêtre en cours finit à la prédiction, ou à
     *  l'instant quand plus rien ne la tient, et l'avenir est ce que la carte promet encore. */
    const windows = relaidWindows(windowsOf(row), next?.windows ?? [], now, step);
    const to = windows[windows.length - 1]!.to;
    const patch = {
      ...(to === row.to ? {} : { to }),
      ...(sameWindows(windows, windowsOf(row))
        ? {}
        : { windows: storedWindows(row.from, windows) }),
      ...(await keepOpenJob(ctx, row, row.from, windows, now)),
      ...reading,
      ...crossings,
    };
    if (Object.keys(patch).length > 0) await ctx.db.patch(row._id, patch);
    return;
  }
  if (next === undefined) return;
  /** La grille ne bouge plus avec l'instant (#145) : une fenêtre future relue telle quelle garde
   *  sa ligne et son rendez-vous, sans réécriture ni job replanifié. */
  const fields = sightingFields(next);
  const open = await keepOpenJob(ctx, row, fields.from, next.windows, now);
  if (
    (row.revealJobId !== undefined || row.noticeFiled === true) &&
    (Object.keys(fields) as Array<keyof typeof fields>).every(
      (key) => key === 'windows' || row[key] === fields[key],
    ) &&
    sameWindows(windowsOf(row), next.windows) &&
    Object.keys(reading).length === 0
  ) {
    const patch = { ...open, ...crossings };
    if (Object.keys(patch).length > 0) await ctx.db.patch(row._id, patch);
    return;
  }
  if (row.revealJobId !== undefined) await cancelJob(ctx, row.revealJobId);
  await ctx.db.patch(row._id, {
    ...fields,
    ...open,
    ...reading,
    ...crossings,
    revealJobId: undefined,
    ...(row.noticeFiled === undefined && row.revealJobId === undefined
      ? { noticeFiled: true }
      : {}),
  });
  if (fields.from <= now) await revealSighting(ctx, row._id, now);
  else if (row.noticeFiled !== true && row.revealJobId !== undefined) {
    await scheduleReveal(ctx, row._id, fields.from);
  }
}

async function insertSighting(
  ctx: MutationCtx,
  movementId: Id<'movements'>,
  sighting: Caught,
  now: number,
  roles: ReadonlyArray<UnitRole>,
): Promise<void> {
  const owner = (await ctx.db.get(movementId))?.playerId;
  const { windows, ...fields } = sightingFields(sighting);
  const sightingId = await ctx.db.insert('sightings', {
    movementId,
    ...(owner === undefined ? {} : { ownerId: owner }),
    ...fields,
    ...(windows === undefined ? {} : { windows }),
  });
  const reading = await writeReading(
    ctx,
    { _id: sightingId },
    columnReading({}, sighting.readWindows, roles, now),
    now,
  );
  const crossings = await keepCrossings(ctx, { _id: sightingId }, sighting.crossings ?? [], now);
  const open = await keepOpenJob(ctx, { _id: sightingId }, fields.from, sighting.windows, now);
  const patch = { ...reading, ...crossings, ...open };
  if (Object.keys(patch).length > 0) await ctx.db.patch(sightingId, patch);
  if (fields.from <= now) await revealSighting(ctx, sightingId, now);
  else await scheduleReveal(ctx, sightingId, fields.from);
}

/** Une ligne neuve ou à venir : son enveloppe et ses fenêtres, toutes promises par la carte. */
const sightingFields = (sighting: Caught) => ({
  playerId: sighting.playerId,
  from: sighting.windows[0]!.from,
  to: sighting.windows[sighting.windows.length - 1]!.to,
  windows: storedWindows(sighting.windows[0]!.from, sighting.windows),
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
  if (sighting.readJobId !== undefined) await cancelJob(ctx, sighting.readJobId);
  if (sighting.openJobId !== undefined) await cancelJob(ctx, sighting.openJobId);
  for (const { jobId } of sighting.crossings ?? [])
    if (jobId !== undefined) await cancelJob(ctx, jobId);
  await ctx.db.delete(sighting._id);
}

/**
 * **Les dépêches des franchissements** (#377, Décisions du 02/11) : une par ronde et par colonne,
 * au premier franchissement de sa ligne, planifiée à son heure. Une dépêche partie reste (sans
 * job) et ferme la ligne à cette colonne ; une dépêche à venir que la carte ne prévoit plus
 * s'annule, et celle qui change d'heure se replanifie. Rend le patch de la ligne, vide si rien
 * ne change.
 */
async function keepCrossings(
  ctx: MutationCtx,
  row: { readonly _id: Id<'sightings'>; readonly crossings?: Doc<'sightings'>['crossings'] },
  desired: ReadonlyArray<Crossing>,
  now: number,
): Promise<{ crossings?: Doc<'sightings'>['crossings'] }> {
  const held = row.crossings ?? [];
  const kept: NonNullable<Doc<'sightings'>['crossings']> = [];
  for (const entry of held) {
    const wanted = desired.find((crossing) => crossing.troopId === entry.troopId);
    /** Une dépêche échue attend son job : la lecture d'après ne voit plus le franchissement
     *  devant elle, et l'annuler le perdrait. */
    if (entry.jobId === undefined || entry.at <= now || wanted?.at === entry.at) kept.push(entry);
    else await cancelJob(ctx, entry.jobId);
  }
  for (const crossing of desired) {
    if (kept.some((entry) => entry.troopId === crossing.troopId)) continue;
    const jobId = await ctx.scheduler.runAt(crossing.at, internal.movements.fileCrossing, {
      sightingId: row._id,
      troopId: crossing.troopId,
      at: crossing.at,
    });
    kept.push({ ...crossing, jobId });
  }
  const same = kept.length === held.length && kept.every((entry, index) => entry === held[index]);
  return same ? {} : { crossings: kept };
}

/** **Le franchissement à son heure** : la dépêche « notre ronde a relevé… », au point de la
 *  ligne. Un job périmé — la ligne n'attend plus cette heure — ne fait rien. */
export async function fileCrossing(
  ctx: MutationCtx,
  { sightingId, troopId, at }: { sightingId: Id<'sightings'>; troopId: Id<'troops'>; at: number },
  now = Date.now(),
): Promise<void> {
  const row = await ctx.db.get(sightingId);
  const entry = row?.crossings?.find((crossing) => crossing.troopId === troopId);
  if (row === null || entry?.jobId === undefined || entry.at !== at || now < at) return;
  await ctx.db.patch(row._id, {
    crossings: row.crossings!.map((crossing) =>
      crossing === entry ? { troopId, at, point: entry.point } : crossing,
    ),
  });
  const movement = await ctx.db.get(row.movementId);
  if (movement === null) return;
  const season = await ctx.db.get(movement.seasonId);
  if (season === null || season.status !== 'launched' || season.concludedAt !== null) return;
  await ctx.db.insert('notices', {
    playerId: row.playerId,
    at,
    kind: 'movementSighted',
    hostCountry: hostAtPoint(pointOf(entry.point)),
    point: entry.point,
    headingDegrees: seenSegment(marchingForce(movement), at, at).headingDegrees,
    detector: 'patrol',
    detectorRegion: null,
  });
  await notifyPlayer(ctx, row.playerId, {
    type: 'sighting',
    phrase: push.sighting,
    url: journalUrl,
    at,
  });
}
