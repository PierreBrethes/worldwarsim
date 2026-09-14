/**
 * Passive detection, recomputed on board events rather than on reads. The ledgers stay per
 * observer — `sightings` for a thread that went past, `campSightings` for a force standing —
 * so `PlayerView` never filters the season's board and never receives a future window before
 * it opens.
 *
 * **Rien ne s'y engage** (ADR 0024 §3, révision du 13/09/2026) : la rencontre en route a été
 * retirée d'ici — plus de `firstMobileEncounter`, plus de rendez-vous de contact. Détecter est
 * voir ; se battre demande un ordre, et l'ordre est résolu à l'arrivée (`engageAt`). La
 * géométrie de l'interception reste dans le domaine, pour l'intercepteur V1.
 */

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
import { seasonBuildings } from '../buildings';
import {
  detectionRangeOf,
  LAST_KNOWN_HOURS,
  LISTENING_STATION_RADIUS_KM,
  outpostReachKm,
} from '../constants';
import { capitalRegionOf, homeCountryOf, pointOfBuilding, regionFacts } from '../regions';
import { hostAmongCountries, hostAtPoint, landAtPoint } from '../routes';
import { asPoint, pointOf, seasonMovements, seasonOutposts } from './forces';

type Mobile = {
  readonly movement: Doc<'movements'>;
  readonly force: MarchingForce;
  readonly rangeKm: number;
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
 */
export async function reassessDetection(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  now = Date.now(),
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (season === null) return;

  const movements = await seasonMovements(ctx, seasonId);

  const active =
    season.status === 'launched' && season.concludedAt === null
      ? movements.filter((movement) => movement.arrivesAt > now)
      : [];
  const board = await detectionBoard(ctx, seasonId, active, now);

  for (const target of movements) {
    const mobile = board.mobileById.get(target._id);
    const desired = mobile === undefined ? [] : sightingsFor(mobile, board, now);
    await syncSightings(ctx, target, await desired, now);
  }

  await forgetStaleSightings(ctx, board, now);

  if (season.status === 'launched' && season.concludedAt === null) {
    await syncCampSightings(ctx, seasonId, board, now);
    await syncLootCrateSightings(ctx, seasonId, board, now);
    await rescheduleLootCrateDetectionJobs(ctx, seasonId, board, now);
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

  await ctx.db.insert('notices', {
    playerId: sighting.playerId,
    at: sighting.from,
    kind: 'movementSighted',
    hostCountry: sighting.detectorHostCountry ?? hostAtPoint(pointOf(movement.from)),
    /** The heading the column held **on leaving the radius**, the same one the arc serves: a
     *  bearing from departure to destination would word a dispatch on the one thing the sighting
     *  no longer grants (design sheet 04, decision 4a of 13/09/2026). */
    headingDegrees: seenSegment(marchingForce(movement), sighting.from, sighting.to).headingDegrees,
    detector: sighting.detector,
    detectorRegion: sighting.detectorRegion ?? null,
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

async function cancelJob(ctx: MutationCtx, jobId: Id<'_scheduled_functions'>): Promise<void> {
  try {
    await ctx.scheduler.cancel(jobId);
  } catch {
    // A callback that has already started validates the stored prediction before doing anything.
  }
}

async function detectionBoard(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  movements: ReadonlyArray<Doc<'movements'>>,
  now: number,
) {
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
  const mobileById = new Map<Id<'movements'>, Mobile>();
  for (const movement of movements) {
    const roles = movement.troopIds.flatMap((troopId) => {
      const troop = troopById.get(troopId);
      return troop === undefined ? [] : [troop.role];
    });
    mobileById.set(movement._id, {
      movement,
      force: marchingForce(movement),
      rangeKm: detectionRangeOf(roles),
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
      detectorHostCountry: station.hostCountry,
      detectorRegion: station.region,
    };
    held.roles.push(troop.role);
    posted.set(key, held);
  }

  const watchers: PassiveWatcher[] = [...posted].flatMap(([id, force]) => {
    const radiusKm = detectionRangeOf(force.roles);
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

  for (const building of buildings) {
    if (building.key !== 'listening') continue;
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

  return { mobileById, watchers, players, posted };
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
  board: DetectionBoard,
  now: number,
): Promise<void> {
  const cutoff = now - LAST_KNOWN_HOURS * 3_600_000;
  for (const player of board.players) {
    for (const sighting of await ctx.db
      .query('sightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect()) {
      const frozen = sighting.frozen;
      if (frozen !== undefined && frozen.closedAt <= cutoff) await deleteSighting(ctx, sighting);
    }
    for (const camp of await ctx.db
      .query('campSightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect()) {
      if (camp.until !== null && camp.until <= cutoff) await ctx.db.delete(camp._id);
    }
  }
}

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

  const caughtBy = (playerId: Id<'players'>, point: LonLat): CampDetector | null => {
    const home = soils.get(hostAmongCountries(point, new Set(soils.keys())));
    const found = (detectors.get(playerId) ?? []).filter(
      (detector) => distanceKm(detector.point, point) <= detector.radiusKm,
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
    const rows = (
      await ctx.db
        .query('campSightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).filter((row) => row.seasonId === seasonId);
    const byStation = new Map(rows.map((row) => [row.stationKey, row]));

    for (const [stationKey, camp] of board.posted) {
      if (camp.playerId === player._id) continue;
      const caught = caughtBy(player._id, camp.point);
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
        await ctx.db.patch(row._id, seen);
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
  for (const prediction of previous) {
    if (prediction.scheduledJobId !== undefined) {
      await cancelJob(ctx, prediction.scheduledJobId);
    }
    await ctx.db.delete(prediction._id);
  }

  const crates = await ctx.db
    .query('lootCrates')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  for (const mobile of board.mobileById.values()) {
    for (const crate of crates) {
      const transition = nextLootCrateDetectionTransition(mobile, pointOf(crate.point), now);
      if (transition === null || transition.at >= crate.expiresAt) continue;
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

async function sightingsFor(
  target: Mobile,
  board: Awaited<ReturnType<typeof detectionBoard>>,
  now: number,
): Promise<ReadonlyArray<Caught>> {
  const caught: Caught[] = [];
  const watchers = board.watchers.filter(
    (watcher) => watcher.playerId !== target.movement.playerId,
  );
  for (const sighting of sightingsAlong({ mine: target.force, watchers, after: now })) {
    const watcher = watchers.find((candidate) => candidate.id === sighting.id);
    if (watcher !== undefined) caught.push({ ...watcher, from: sighting.from, to: sighting.to });
  }

  for (const observer of board.mobileById.values()) {
    if (observer.movement.playerId === target.movement.playerId || observer.rangeKm <= 0) continue;
    const window = mobileSighting({
      observer: observer.force,
      target: target.force,
      radiusKm: observer.rangeKm,
      after: now,
    });
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

  caught.push(...crossedSoil(target, board.players, now));
  return caught;
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
  const from = Math.max(now, target.force.departedAt);
  const span = target.force.arrivesAt - from;
  if (soils.size === 0 || span <= 0) return [];

  const windows = new Map<string, { from: number; to: number }>();
  for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
    const at = from + (index * span) / INTERCEPTION_SAMPLES;
    const host = hostAmongCountries(positionAt(target.force, at), new Set(soils.keys()));
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

  const rows = await ctx.db
    .query('sightings')
    .withIndex('byMovement', (q) => q.eq('movementId', movement._id))
    .collect();
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
    await ctx.db.patch(row._id, { to: Math.max(row.to, next.to) });
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
  const sightingId = await ctx.db.insert('sightings', {
    movementId,
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
