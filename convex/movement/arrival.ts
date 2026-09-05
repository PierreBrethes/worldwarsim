/**
 * The far end of a movement, once `arrive` has dispatched on its type: engage, stand, fade,
 * re-hang, or put what is left on the road home. ADR 0014, one pass per engagement; ADR 0019 §3,
 * a rout refluxes to the nearest anchor and nobody teleports; rule 3 of the project, a column
 * that cannot get home stands where it is rather than dying for want of an address.
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { distanceKm, type LonLat } from '../../src/domain/geo';
import { landCostOf, routeModeOf } from '../../src/domain/movement-orders';
import { isNation } from '../../src/domain/nations';
import { nearestOutpost } from '../../src/domain/outposts';
import { buildingAt, playerBuildings } from '../buildings';
import { resolveContact } from '../combat';
import { OUTPOST_DISABLED_HOURS, OUTPOST_IMMUNITY_HOURS } from '../constants';
import { capitalRegionOf, pointOfBuilding, regionFacts } from '../regions';
import { hostAtPoint, routeBetween } from '../routes';
import { fileSightings } from './detection';
import {
  asPoint,
  defenceOf,
  outpostsOf,
  pointOf,
  troopsCarriedBy,
  type TroopAddress,
} from './forces';
import { surveyFromPoint } from '../surveys';
import { pacedMinutes } from './orders';

/** A sighting left behind is an arc the map is asked to draw from nothing. The movement
 *  disappears in three places, and all three go through here. */
export async function forgetMovement(ctx: MutationCtx, movementId: Id<'movements'>): Promise<void> {
  const seen = await ctx.db
    .query('sightings')
    .withIndex('byMovement', (q) => q.eq('movementId', movementId))
    .collect();
  for (const sighting of seen) await ctx.db.delete(sighting._id);
  await ctx.db.delete(movementId);
}

/** **A column that finds nobody has not fought**: buildings are not looted yet, so an attack on
 *  empty ground turns around with no engagement and nothing to show for the walk. */
export async function engageAt(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  /** Narrowed by the caller: the stored `type` is the whole vocabulary, two of its words walk in here. */
  type: 'attack' | 'raid',
  now: number,
): Promise<void> {
  const owner = await ctx.db.get(movement.playerId);
  const marching = await troopsCarriedBy(ctx, movement);
  if (!owner || marching.length === 0) return;

  const outpost =
    movement.target.kind === 'outpost' ? await ctx.db.get(movement.target.outpostId) : null;
  const defence = await defenceOf(ctx, movement);
  if (defence === null) {
    /** **An outpost nobody garrisons falls to whoever walks up to it.** No engagement to file,
     *  but the point still goes out of service — the only thing the raid came for. */
    if (type === 'raid' && outpost !== null) await deactivate(ctx, outpost, now, null);
    /** No pass, therefore no account, therefore nothing in the journal — a player came back to
     *  "rien à signaler" after the longest march of his season. */
    await ctx.db.insert('notices', {
      playerId: movement.playerId,
      at: now,
      kind: 'columnFoundNothing',
      movementType: type,
      hostCountry: movement.hostCountry,
      troops: marching.length,
    });
    await walkHome(ctx, { winners: marching, beaten: [] }, pointOf(movement.to), now);
    return;
  }

  const { engagementId, engagement, routed } = await resolveContact(ctx, {
    seasonId: owner.seasonId,
    attacker: { playerId: movement.playerId, troops: marching },
    defender: { playerId: defence.playerId, troops: defence.troops },
    cause: 'arrival',
    point: movement.to,
    hostCountry: movement.hostCountry,
    outpostId: defence.outpostId,
    disabledUntil: null,
    at: now,
  });

  if (type === 'raid' && outpost !== null && engagement.winner === 'attacker') {
    await deactivate(ctx, outpost, now, engagementId);
  }

  /** Whoever is still on his feet walks back, routed or not: the column came to fight, not to
   *  stay (ADR 0019 §3 for the other side). */
  const survivors = marching.filter((troop) =>
    engagement.outcomes.some(
      (outcome) => outcome.id === troop._id && outcome.state !== 'destroyed',
    ),
  );
  await walkHome(ctx, { winners: survivors, beaten: routed }, pointOf(movement.to), now);
}

/**
 * **The building a march was aimed at, if it still answers to the column's owner.** Razed or
 * lost since the departure, `null`: the column then stands on the point it reached (rule 3,
 * ADR 0019 §1) and nothing hangs from a building that is not there.
 */
export async function garrisonOf(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<Doc<'buildings'> | null> {
  if (movement.target.kind !== 'building') return null;
  const building = await ctx.db.get(movement.target.buildingId);
  return building !== null && building.playerId === movement.playerId ? building : null;
}

/** ADR 0019 §3: the column stops walking and stands there. When something *is* waiting, the
 *  standing force is handed to `resolveContact` as the **attacker** — an attack buys initiative by
 *  declaring itself (ADR 0014), a march declares nothing and takes the first blow. What is still
 *  on its feet stays: losing a pass it did not seek does not send it home.
 *
 *  `address` is what the standing troops take — the point reached, or the building they came to
 *  garrison (decision 64b). It answers how many took it, so the journal can tell a garrison
 *  entered from a column that fought its way to a point and lost everything on it. */
export async function standAt(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
  address: TroopAddress = movement.to,
): Promise<number> {
  const owner = await ctx.db.get(movement.playerId);
  const marching = await troopsCarriedBy(ctx, movement);
  if (!owner || marching.length === 0) return 0;

  const defence = await defenceOf(ctx, movement);
  if (defence === null) {
    for (const troop of marching) await ctx.db.patch(troop._id, { stationedAt: address });
    return marching.length;
  }

  const { engagement, routed } = await resolveContact(ctx, {
    seasonId: owner.seasonId,
    attacker: { playerId: defence.playerId, troops: defence.troops },
    defender: { playerId: movement.playerId, troops: marching },
    cause: 'arrival',
    point: movement.to,
    hostCountry: movement.hostCountry,
    outpostId: defence.outpostId,
    disabledUntil: null,
    at: now,
  });

  const stateOf = (troopId: string) =>
    engagement.outcomes.find((outcome) => outcome.id === troopId)?.state ?? null;
  const standing = marching.filter((troop) => stateOf(troop._id) === 'standing');
  for (const troop of standing) await ctx.db.patch(troop._id, { stationedAt: address });
  /** `routed` carries both sides of the pass, so the column that broke contact walks back from
   *  here just as the camp that held the ground and lost it does (ADR 0019 §3). */
  await walkHome(ctx, { winners: [], beaten: routed }, pointOf(movement.to), now);
  return standing.length;
}

/** ADR 0004, deactivated and never taken: the immunity window stops a relay of cheap raids from
 *  holding a point out of service for good. Destruction waits for looting, so nothing counts
 *  them. */
async function deactivate(
  ctx: MutationCtx,
  outpost: Doc<'outposts'>,
  now: number,
  engagementId: Id<'engagements'> | null,
): Promise<void> {
  if (outpost.immuneUntil !== null && outpost.immuneUntil > now) return;

  const disabledUntil = now + OUTPOST_DISABLED_HOURS * 3_600_000;
  await ctx.db.patch(outpost._id, {
    disabledUntil,
    immuneUntil: disabledUntil + OUTPOST_IMMUNITY_HOURS * 3_600_000,
  });
  if (engagementId !== null) await ctx.db.patch(engagementId, { disabledUntil });
  /** **For the owner, and him alone.** A raid that met no garrison files no engagement at all,
   *  so without this the point stops paying and nothing anywhere says why. */
  await ctx.db.insert('notices', {
    playerId: outpost.playerId,
    at: now,
    kind: 'outpostDisabled',
    hostCountry: outpost.hostCountry,
    specialization: outpost.specialization,
  });
}

/** `fromBuildingId` carries no address here — the column left an outpost, not a building
 *  (question 21, 18/08) — so the barracks is looked up fresh. Razed since, the troops still come
 *  home rather than die for it (rule 3). */
export async function recallAt(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const buildings =
    movement.target.kind === 'region' ? await playerBuildings(ctx, movement.playerId) : [];
  const barracks =
    movement.target.kind === 'region'
      ? buildingAt(buildings, 'barracks', movement.target.regionId)
      : undefined;
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: barracks ? barracks._id : movement.to });
  }
}

/** A building razed while its troops were away leaves them standing where they arrived rather
 *  than hanging from nothing (rule 3, ADR 0019 §1). */
export async function attachHome(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const home = await homeOf(ctx, movement);
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: home });
  }
}

async function homeOf(ctx: MutationCtx, movement: Doc<'movements'>): Promise<TroopAddress> {
  if (movement.fromBuildingId !== null) {
    const station = await ctx.db.get(movement.fromBuildingId);
    return station?._id ?? movement.to;
  }
  /** A rout refluxed to one of its own outposts becomes its garrison (ADR 0019 §3); razed since
   *  — the anchor is read once, at the rout — it stands on the ground it reached. */
  if (movement.target.kind === 'outpost') {
    const outpost = await ctx.db.get(movement.target.outpostId);
    return outpost?._id ?? movement.to;
  }
  /** The point **is** the address and the target carries it (ADR 0019 §3). */
  if (movement.target.kind === 'point') return movement.to;
  /** National soil, hanging from nothing that stands — what `null` means in the schema. */
  return null;
}

/** ADR 0019 §3 (amended 19/08): the nearest anchor the player already holds — the same set the
 *  upkeep reads at ×1 and the aim calls recognised ground, so no frontier is invented here. A
 *  deactivated outpost rallies all the same: deactivation suspends its effects, never its address. */
async function nearestAnchor(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  from: LonLat,
): Promise<{ point: LonLat; hostCountry: string; outpostId: Id<'outposts'> | null } | null> {
  const owner = await ctx.db.get(playerId);
  const capital =
    owner && isNation(owner.nation) ? regionFacts(capitalRegionOf(owner.nation)) : null;
  const home =
    capital === null
      ? null
      : { point: capital.point, hostCountry: capital.country, outpostId: null };

  const outposts = (await outpostsOf(ctx, playerId)).map((outpost) => ({
    point: pointOf(outpost.point),
    outpost,
  }));
  const found = nearestOutpost(from, outposts);
  if (found === null) return home;
  if (home !== null && distanceKm(home.point, from) <= found.km) return home;
  return {
    point: found.nearest.point,
    hostCountry: found.nearest.outpost.hostCountry,
    outpostId: found.nearest.outpost._id,
  };
}

/** `key` groups the troops sharing one road: one `return` per destination **and per owner**, so
 *  a movement never carries two nations. `stranded` is the anti-death fallback of rule 3. */
type HomeRoad = {
  readonly kind: 'walks';
  readonly key: string;
  readonly point: LonLat;
  readonly hostCountry: string;
  readonly target: Doc<'movements'>['target'];
  readonly fromBuildingId: Id<'buildings'> | null;
  readonly stranded: TroopAddress;
};

type Homeward = { readonly kind: 'stays'; readonly address: TroopAddress } | HomeRoad;

/** **Where?** A winner goes back to the address it left from — `stationedAt` survives the
 *  departure, and that is its whole reason for being. A **beaten** troop whose address is not a
 *  building refluxes to its nearest anchor, read once here: left standing it would sit ten
 *  kilometres from the force that beat it for the rest of the season (ADR 0018 §1). */
async function homeFor(
  ctx: MutationCtx,
  troop: Doc<'troops'>,
  routed: boolean,
  from: LonLat,
): Promise<Homeward | null> {
  const address = troop.stationedAt;
  /** It hangs from nothing, which is national soil already (`homeOf`): no trip to make. */
  if (address === null) return null;

  const buildingId = typeof address === 'string' ? ctx.db.normalizeId('buildings', address) : null;
  if (buildingId !== null) {
    const building = await ctx.db.get(buildingId);
    const origin = building === null ? null : regionFacts(building.regionId);
    const back = building === null ? null : pointOfBuilding(building);
    /** Razed while its column was away: it stays on the ground it fought on (ADR 0019 §1). */
    if (building === null || origin === null || back === null)
      return { kind: 'stays', address: asPoint(from) };
    return {
      kind: 'walks',
      key: `building:${troop.playerId}:${building._id}`,
      point: back,
      hostCountry: origin.country,
      target: { kind: 'home' },
      fromBuildingId: building._id,
      stranded: asPoint(from),
    };
  }

  if (routed) {
    const anchor = await nearestAnchor(ctx, troop.playerId, from);
    /** No nation, no home ground to reflux to: he comes home all the same (rule 3), he just does not walk. */
    if (anchor === null) return { kind: 'stays', address: null };
    return {
      kind: 'walks',
      key: `anchor:${troop.playerId}:${anchor.outpostId ?? 'soil'}`,
      point: anchor.point,
      hostCountry: anchor.hostCountry,
      /** The anchor travels as the aim it is: `attachHome` reads it back to know whether the
       *  column becomes a garrison or comes back to national soil hanging from nothing. */
      target:
        anchor.outpostId === null
          ? { kind: 'home' }
          : { kind: 'outpost', outpostId: anchor.outpostId },
      fromBuildingId: null,
      stranded: null,
    };
  }

  if (typeof address !== 'string') {
    const point = pointOf(address);
    return {
      kind: 'walks',
      key: `point:${troop.playerId}:${point[0]},${point[1]}`,
      point,
      /** Read off the geometry, exactly as a departure reads it: only the point knows. */
      hostCountry: hostAtPoint(point),
      target: { kind: 'point', point: asPoint(point) },
      fromBuildingId: null,
      stranded: asPoint(from),
    };
  }

  const outpostId = ctx.db.normalizeId('outposts', address);
  const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
  /** Razed while its garrison was away: it stands on the ground it fought on (rule 3). */
  if (outpost === null) return { kind: 'stays', address: asPoint(from) };
  return {
    kind: 'walks',
    key: `outpost:${troop.playerId}:${outpost._id}`,
    point: pointOf(outpost.point),
    hostCountry: outpost.hostCountry,
    target: { kind: 'outpost', outpostId: outpost._id },
    fromBuildingId: null,
    stranded: asPoint(from),
  };
}

/** **The road home, and nobody teleports on it** (ADR 0019 §3, amended 19/08). Always a real
 *  `return`: never ordered, no slot, no domain gate, and it engages nothing it lands on. Travel
 *  time is real for the winners as much as for the beaten. */
export async function walkHome(
  ctx: MutationCtx,
  {
    winners,
    beaten,
  }: {
    readonly winners: ReadonlyArray<Doc<'troops'>>;
    readonly beaten: ReadonlyArray<Doc<'troops'>>;
  },
  from: LonLat,
  now: number,
): Promise<void> {
  /** The rout wins the tie: an attacker that broke contact is named on both lists, and that was
   *  the last thing it did. A map keyed by the troop makes two roads at once impossible. */
  const homeward = new Map<Id<'troops'>, { troop: Doc<'troops'>; routed: boolean }>();
  for (const troop of winners) homeward.set(troop._id, { troop, routed: false });
  for (const troop of beaten) homeward.set(troop._id, { troop, routed: true });

  /** **Ce que chacun a vu du sol où il s'est battu** (ADR 0020 §5) : une passe de résolution
   *  laisse des troupes debout sur un point, et les deux camps en repartent en le sachant. Un
   *  relevé par joueur présent, pas un par troupe — c'est le même sol. */
  for (const playerId of new Set([...homeward.values()].map(({ troop }) => troop.playerId))) {
    await surveyFromPoint(ctx, playerId, from, now);
  }

  const roads = new Map<string, { home: HomeRoad; group: Array<Doc<'troops'>> }>();
  for (const { troop, routed } of homeward.values()) {
    const home = await homeFor(ctx, troop, routed, from);
    if (home === null) continue;
    if (home.kind === 'stays') {
      await ctx.db.patch(troop._id, { stationedAt: home.address });
      continue;
    }
    const road = roads.get(home.key) ?? { home, group: [] };
    road.group.push(troop);
    roads.set(home.key, road);
  }

  for (const { home, group } of roads.values()) {
    /** **Already standing on it**, and it never left — the address it has is the one it would
     *  come back to. */
    if (home.point[0] === from[0] && home.point[1] === from[1]) continue;

    /** A column coming home from overseas has a sea to recross; `'land'` would find no route at
     *  all. A return is not an order, so it owes no port. */
    const roles = group.map((troop) => troop.role);
    const route = routeBetween(from, home.point, routeModeOf(roles), landCostOf(roles));
    /** No road home — a landing whose transports sank, and nothing else. */
    if (route === null) {
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt: home.stranded });
      continue;
    }

    /** A column walking home is its owner's like any other, and his relays carry it back. */
    const arrivesAt = now + (await pacedMinutes(ctx, group[0]!.playerId, route, now)) * 60_000;
    const movementId = await ctx.db.insert('movements', {
      /** The resolution that files a return holds no season of its own. */
      seasonId: group[0]!.seasonId,
      playerId: group[0]!.playerId,
      type: 'return',
      fromBuildingId: home.fromBuildingId,
      target: home.target,
      from: asPoint(from),
      to: asPoint(home.point),
      hostCountry: home.hostCountry,
      points: route.points.map(asPoint),
      legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
      distanceUnits: route.distanceUnits,
      costUnits: route.costUnits,
      landCost: route.landCost,
      troopIds: group.map((troop) => troop._id),
      departedAt: now,
      arrivesAt,
    });
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
    /** **A return is a movement, and what moves is seen** (ADR 0005): a class of movement
     *  invisible to the fog would be a hole in the rule, not a rule of its own. */
    await fileSightings(ctx, (await ctx.db.get(movementId))!);
  }
}
