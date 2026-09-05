/**
 * The fog, written at departure and never recomputed: who catches this column on the road
 * (`intercept`) and who merely sees it pass (`sightings`). One reading, once, at the moment the
 * order is filed — ADR 0018 §3 for the interception, ADR 0019 §5 and design sheet 04 for the
 * four detectors, `WWS/docs/technique/brouillard-et-fanout.md` for why the rows are denormalised.
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { bearingDegrees, type LonLat } from '../../src/domain/geo';
import {
  firstInterception,
  INTERCEPTION_SAMPLES,
  positionAt,
  sightingsAlong,
  type MarchingForce,
  type Watcher,
} from '../../src/domain/interception';
import { seasonBuildings } from '../buildings';
import { troopsStationedAt } from '../combat';
import {
  ARRIVAL_RADIUS_KM,
  INTERCEPTION_RADIUS_KM,
  LISTENING_STATION_RADIUS_KM,
  outpostReachKm,
  SCOUT_RADIUS_KM,
} from '../constants';
import { homeCountryOf, pointOfBuilding, regionFacts } from '../regions';
import { hostAmongCountries, hostAtPoint } from '../routes';
import {
  asPoint,
  defenceOf,
  pointOf,
  postedForces,
  seasonMovements,
  seasonOutposts,
  type ContactForce,
} from './forces';

/** ADR 0018 §3: the contact is looked for once, at departure. It is the newcomer that looks —
 *  nothing already marching is re-examined, which is what keeps a departure from costing a sweep
 *  of every pair on the map. */
export async function scheduleInterception(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<void> {
  const movementId = movement._id;
  const { playerId, departedAt, arrivesAt } = movement;
  const points = movement.points.map(pointOf);

  /** ADR 0014: what the arrival will answer for cannot also catch the column on the road. Asked
   *  of `defenceOf` rather than a second reading of "who stands here" that would drift from it —
   *  the blind radius this replaces cost a neighbour its whole net for a raid it was not in. */
  const answered = new Set<Id<'troops'>>(
    (await defenceOf(ctx, movement))?.troops.map((troop) => troop._id) ?? [],
  );
  const willBeMet = (troopIds: ReadonlyArray<Id<'troops'>>): boolean =>
    troopIds.some((troopId) => answered.has(troopId));

  const sources = new Map<string, ContactForce>();
  const standing: Array<{ id: string; point: LonLat }> = [];
  for (const outpost of await seasonOutposts(ctx, movement.seasonId)) {
    if (outpost.playerId === playerId) continue;
    const garrison = await troopsStationedAt(ctx, outpost._id);
    if (garrison.length === 0) continue;
    if (willBeMet(garrison.map((troop) => troop._id))) continue;
    const id = `outpost:${outpost._id}`;
    sources.set(id, { kind: 'outpost', outpostId: outpost._id });
    standing.push({ id, point: pointOf(outpost.point) });
  }

  const marching: Array<MarchingForce> = (await seasonMovements(ctx, movement.seasonId))
    .filter((other) => other.playerId !== playerId && other._id !== movementId)
    .map((other) => {
      const id = `movement:${other._id}`;
      sources.set(id, { kind: 'movement', movementId: other._id });
      return {
        id,
        points: other.points.map(pointOf),
        departedAt: other.departedAt,
        arrivesAt: other.arrivesAt,
      };
    });

  const mine = { id: `movement:${movementId}`, points, departedAt, arrivesAt };
  const intercepted = firstInterception({
    mine,
    standing,
    marching,
    radiusKm: INTERCEPTION_RADIUS_KM,
  });

  /** **A crossing is not an interception, and the radius is the difference**: a posted force
   *  reaches for nothing (ADR 0019 §3), so it catches at `ARRIVAL_RADIUS_KM` and not at the net's
   *  `INTERCEPTION_RADIUS_KM` — two hundred kilometres would make three pawns a blockade. */
  const posted = (await postedForces(ctx, movement.seasonId, playerId)).filter(
    (camp) => !willBeMet(camp.troopIds),
  );
  for (const camp of posted) sources.set(camp.id, camp.force);
  const crossed = firstInterception({
    mine,
    standing: posted,
    marching: [],
    radiusKm: ARRIVAL_RADIUS_KM,
  });

  /** The first on the road answers, and it alone: an engagement changes the column, so what it
   *  would have met later has to be met by what is left of it. */
  const contact = [intercepted, crossed]
    .filter((candidate) => candidate !== null)
    .sort((a, b) => a.at - b.at)[0];
  if (contact === undefined) return;

  await ctx.scheduler.runAt(contact.at, internal.movements.intercept, {
    /** `firstInterception` hands back one of the ids it was given, and every one was filed
     *  above — the `!` is that round trip, not an assumption. */
    by: sources.get(contact.withId)!,
    movementId,
    point: asPoint(contact.point),
  });
}

/**
 * ADR 0019 §5, design sheet 04, denormalised as `brouillard-et-fanout.md` prescribes. The
 * consequence is a design decision, not a limit of the optimisation: **a troop posted after a
 * departure will never see that movement.** Intelligence is a wager, not a reaction, and the
 * screen has to say so or it reads as a bug on the first day.
 */
export async function fileSightings(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const mine: MarchingForce = {
    id: `movement:${movement._id}`,
    points: movement.points.map(pointOf),
    departedAt: movement.departedAt,
    arrivesAt: movement.arrivesAt,
  };

  const watchers = await watchersAgainst(ctx, movement);
  const caught: Array<Caught> = [];
  for (const sighting of sightingsAlong({ mine, watchers })) {
    const watcher = watchers.find((candidate) => candidate.id === sighting.id);
    if (watcher === undefined) continue;
    caught.push({ ...watcher, from: sighting.from, to: sighting.to });
  }
  caught.push(...(await crossedSoil(ctx, movement, mine)));
  if (caught.length === 0) return;

  /** **One row per observer, whatever caught the thread**: two rows would draw the same arc
   *  twice on the same board. The window is the union, the detector kept is the one that saw it
   *  first, and `DETECTOR_ORDER` breaks a tie so the same board always names the same one. */
  const byObserver = new Map<Id<'players'>, Caught>();
  for (const sighting of caught) {
    const held = byObserver.get(sighting.playerId);
    if (held === undefined) {
      byObserver.set(sighting.playerId, sighting);
      continue;
    }
    const first = earlier(held, sighting);
    byObserver.set(sighting.playerId, {
      ...first,
      from: Math.min(held.from, sighting.from),
      to: Math.max(held.to, sighting.to),
    });
  }

  /** The heading leaks nothing the observer does not already hold: the detected arc hands him
   *  the thread's own endpoints (`detectedArcs`). Fiche 04 for what the row never carries. */
  const heading = bearingDegrees(pointOf(movement.from), pointOf(movement.to));

  for (const [playerId, sighting] of byObserver) {
    await ctx.db.insert('sightings', {
      playerId,
      movementId: movement._id,
      from: sighting.from,
      to: sighting.to,
      detector: sighting.detector,
      detectorId: sighting.detectorId,
    });
    /** Filed here and not on reading: a journal that recomputed the sighting would date it from
     *  the visit rather than from the departure. */
    await ctx.db.insert('notices', {
      playerId,
      at: sighting.from,
      kind: 'movementSighted',
      hostCountry: sighting.hostCountry,
      headingDegrees: heading,
      detector: sighting.detector,
      detectorRegion: sighting.detectorRegion,
    });
  }
}

/** Design sheet 04's ranking. Nothing reads it as a priority of detection — it only settles
 *  which of two that caught a thread at the same step gets named. */
const DETECTOR_ORDER = ['territory', 'station', 'outpost', 'troop'] as const;

type Detector = (typeof DETECTOR_ORDER)[number];

/** `playerId` is the **observer**, never the owner of what was seen. */
type Caught = {
  readonly playerId: Id<'players'>;
  readonly detector: Detector;
  readonly detectorId: Id<'buildings'> | Id<'outposts'> | null;
  /** Where the detector stands, so the dispatch can place it without a second lookup. */
  readonly hostCountry: string;
  readonly detectorRegion: string | null;
  readonly from: number;
  readonly to: number;
};

const earlier = (held: Caught, sighting: Caught): Caught =>
  sighting.from < held.from ||
  (sighting.from === held.from &&
    DETECTOR_ORDER.indexOf(sighting.detector) < DETECTOR_ORDER.indexOf(held.detector))
    ? sighting
    : held;

/**
 * The three detectors that stand somewhere. The territory is not among them and cannot be: it has
 * no point and no radius, so it is walked separately (`crossedSoil`). ADR 0018 §6: a detector out
 * of service hears nothing, and silencing what one raided is the second sense of the raid.
 */
async function watchersAgainst(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<ReadonlyArray<Watcher & Omit<Caught, 'from' | 'to'>>> {
  const at = movement.departedAt;
  const watchers: Array<Watcher & Omit<Caught, 'from' | 'to'>> = [];

  for (const camp of await postedForces(ctx, movement.seasonId, movement.playerId)) {
    watchers.push({
      id: camp.id,
      point: camp.point,
      radiusKm: SCOUT_RADIUS_KM,
      playerId: camp.force.playerId,
      detector: 'troop',
      detectorId: null,
      hostCountry: hostAtPoint(camp.point),
      detectorRegion: null,
    });
  }

  for (const building of await seasonBuildings(ctx, movement.seasonId)) {
    if (building.key !== 'listening' || building.playerId === movement.playerId) continue;
    /** A station listens from where it stands, and every rule reads that through one function
     *  (`pointOfBuilding`): the day a second building carries a point of its own, this line
     *  does not have to be found again. */
    const facts = regionFacts(building.regionId);
    const stand = pointOfBuilding(building);
    if (facts === null || stand === null) continue;
    watchers.push({
      id: `station:${building._id}`,
      point: stand,
      radiusKm: LISTENING_STATION_RADIUS_KM,
      playerId: building.playerId,
      detector: 'station',
      detectorId: building._id,
      hostCountry: facts.country,
      detectorRegion: facts.name,
    });
  }

  for (const outpost of await seasonOutposts(ctx, movement.seasonId)) {
    if (outpost.specialization !== 'listening' || outpost.playerId === movement.playerId) continue;
    if (outpost.disabledUntil !== null && outpost.disabledUntil > at) continue;
    watchers.push({
      id: `outpost:${outpost._id}`,
      point: pointOf(outpost.point),
      radiusKm: outpostReachKm(outpost.level),
      playerId: outpost.playerId,
      detector: 'outpost',
      detectorId: outpost._id,
      hostCountry: outpost.hostCountry,
      detectorRegion: null,
    });
  }

  return watchers;
}

/** Design sheet 04's first detector, and the only one that is not a thing: no radius, the soil
 *  itself. Containment is asked only of the soils that can answer — eight players at most,
 *  against the hundred and fifty-five countries a full reading would test. */
async function crossedSoil(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  mine: MarchingForce,
): Promise<ReadonlyArray<Caught>> {
  const owner = await ctx.db.get(movement.playerId);
  if (owner === null) return [];

  const soils = new Map<string, Id<'players'>>();
  for (const player of await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', owner.seasonId))
    .collect()) {
    if (player._id === movement.playerId) continue;
    const home = homeCountryOf(player.nation);
    if (home !== null) soils.set(home, player._id);
  }
  if (soils.size === 0) return [];

  const span = mine.arrivesAt - mine.departedAt;
  if (span <= 0) return [];
  const windows = new Map<string, { from: number; to: number }>();
  for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
    const at = mine.departedAt + (index * span) / INTERCEPTION_SAMPLES;
    const host = hostAmongCountries(positionAt(mine, at), new Set(soils.keys()));
    if (host === '') continue;
    const window = windows.get(host);
    if (window === undefined) windows.set(host, { from: at, to: at });
    else window.to = at;
  }

  return [...windows].map(([host, window]) => ({
    playerId: soils.get(host)!,
    detector: 'territory' as const,
    detectorId: null,
    hostCountry: host,
    detectorRegion: null,
    from: window.from,
    to: window.to,
  }));
}
