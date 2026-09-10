import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import {
  foundingRefusal,
  landCostOf,
  movementBehavior,
  plunderRefusalOf,
  refusalOf,
  routeModeOf,
} from '../src/domain/movement-orders';
import { firstMobileEncounter } from '../src/domain/interception';
import { carryCapacityOf, trimLootToCapacity } from '../src/domain/loot';
import { canonicalBuildingKey, RESOURCES } from '../src/domain/ids';
import type { ComputedRoute } from '../src/domain/routing';
import { playerBuildings } from './buildings';
import {
  cargoTotal,
  selectedStationedCargo,
  stationCargoLoads,
  stationMovementLoot,
  takeStationedCargo,
} from './cargo';
import { resolveContact } from './combat';
import {
  CARRY_CAPACITY_BY_ROLE,
  PLUNDER_DISABLED_HOURS,
  PLUNDER_HOURS_PRESENT,
  outpostReachKm,
  routeMinutes,
} from './constants';
import { fail } from './errors';
import {
  attachHome,
  engageAt,
  forgetMovement,
  garrisonOf,
  recallAt,
  standAt,
  walkHome,
} from './movement/arrival';
import {
  asPoint,
  movementsOf,
  pointOf,
  recognises,
  specializationServed,
  troopsCarriedBy,
} from './movement/forces';
import {
  aimOf,
  columnOf,
  departureOf,
  march,
  pacedMinutes,
  sameStation,
  surveyedPlunderTarget,
  surveyedPlunderAim,
  troopsAmong,
} from './movement/orders';
import {
  mobileForceOf,
  reassessDetection,
  revealSighting as revealScheduledSighting,
} from './movement/detection';
import { nearestRegion, pointOfBuilding, regionFacts, regionOfOutpost } from './regions';
import { reportChange, settleBeforeChange } from './production';
import { surveyAlongRoute, surveyFoundation } from './surveys';
import { hostAtPoint, routeBetween } from './routes';
import { playerByToken, requirePlayable, seasonStillPlays } from './seasons';
import { arriveForPlunder, completeLootDelivery, completePresence } from './plunder';
import { resolveLootCollectionArrivals, startLootCollectionMission } from './lootCollections';
import { restHold } from './movement/rest';

export { restHold } from './movement/rest';
import {
  ATTACK_TARGET,
  CONTACT_FORCE,
  LON_LAT,
  MOVEMENT_ORIGIN,
  MOVEMENT_TYPE,
  SPECIALIZATION,
} from './validators';

/**
 * The ordering surface, and nothing else: every `api.movements.*` door lives here. Foundation,
 * march, attack and raid are ordered, plus the return nobody orders (ADR 0019). Le leurre a été
 * retiré du jeu le 29/08/2026 : plus aucune porte ne le file.
 * The helpers are in `convex/movement/`: `orders` files a departure, `detection` fills the fog,
 * `arrival` resolves the far end, `forces` answers who stands where.
 */

/** ADR 0019 §1: one founds where one stands, and the founding column becomes the garrison of
 *  its own point (`garnison-adresse.md`). */
export const foundOutpostHere = mutation({
  args: {
    token: v.string(),
    point: LON_LAT,
    /**
     * **La région sous le point, nommée par la carte** (`regionAtPoint`, précision de l'ADR 0020
     * du 04/09) : le serveur ne tient aucun polygone — même limite assumée que le quai d'un port
     * — et il ne peut donc que vérifier que le pays de cette région est bien celui du sol. Au
     * dézoom la couche des régions n'existe pas : `null` est alors la réponse honnête, et le
     * point se relit par la géographie comme ceux d'avant le champ.
     */
    regionId: v.union(v.string(), v.null()),
    specialization: SPECIALIZATION,
    troopIds: v.array(v.id('troops')),
  },
  handler: async (ctx, { token, point, regionId, specialization, troopIds }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);

    /** `troopIds` is a manifest, not a second attachment, so standing at the point is not
     *  enough: a column that left it is on the road. */
    const marching = new Set<Id<'troops'>>(
      (await movementsOf(ctx, player._id)).flatMap((movement) => movement.troopIds),
    );

    const troops: Array<Doc<'troops'>> = [];
    for (const troopId of troopIds) {
      const troop = await ctx.db.get(troopId);
      if (!troop || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
      if (!sameStation(troop.stationedAt, point) || marching.has(troopId)) {
        fail('TROOP_NOT_AT_ORIGIN', { troopId });
      }
      troops.push(troop);
    }

    /** The server holds no polygons, so whose ground this is is the nearest region's — the only
     *  containment it has. A region already carrying a building of mine is `FRIENDLY_TARGET`. */
    const here = nearestRegion(pointOf(point));
    const buildings = await playerBuildings(ctx, player._id);
    const refusal = foundingRefusal(
      troops.map((troop) => troop.role),
      here !== null && buildings.some((building) => building.regionId === here.id),
    );
    if (refusal !== null) fail(refusal, {});

    /**
     * **Où le point se plante**, et c'est tout ce que le serveur retient du sol : le pays qu'il
     * lit sur le polygone, et la région que la carte a nommée — gardée seulement si elle est de
     * ce pays-là, faute de quoi un clic au ras d'une frontière désignerait le voisin. Rien
     * n'est écrit quand elle manque : le repli de `regionOfOutpost` répond alors, comme pour les
     * points d'avant le champ.
     */
    const hostCountry = hostAtPoint(pointOf(point));
    const ground =
      regionId !== null && regionFacts(regionId)?.country === hostCountry
        ? { point, hostCountry, regionId }
        : { point, hostCountry };

    /**
     * **Les stocks se règlent avant que la couleur change** (ADR 0020 §6). Une fondation peut
     * couper la production d'un voisin — le sien comme celui d'en face — et la règle veut que la
     * coupure prenne effet **à la date où elle se produit**, jamais rétroactivement sur les
     * heures déjà écoulées. C'est le même contrat que tout `settle` avant écriture, sur toute la
     * table plutôt que sur un joueur : la couleur est la seule chose du jeu qu'un geste d'un
     * joueur change chez un autre.
     */
    const founded = Date.now();
    const before = await settleBeforeChange(ctx, season._id, founded);

    const outpostId = await ctx.db.insert('outposts', {
      seasonId: season._id,
      playerId: player._id,
      ...ground,
      level: 1,
      specialization,
      foundedAt: founded,
      disabledUntil: null,
      immuneUntil: null,
    });
    const cargo = await takeStationedCargo(ctx, {
      seasonId: season._id,
      playerId: player._id,
      stationedAt: point,
      troops,
    });
    for (const troop of troops) await ctx.db.patch(troop._id, { stationedAt: outpostId });
    await stationCargoLoads(ctx, {
      seasonId: season._id,
      playerId: player._id,
      troopIds: troops.map((troop) => troop._id),
      stationedAt: outpostId,
      loads: cargo,
    });
    /** **La fondation est un point d'échantillonnage** (ADR 0020 §5) : le sol autour vient de
     *  changer de main, et le relevé de chacun de ceux qui regardent ce sol-là bouge avec lui. */
    await surveyFoundation(
      ctx,
      season._id,
      pointOf(point),
      outpostReachKm(1),
      regionOfOutpost(ground),
      Date.now(),
    );
    await ctx.db.insert('notices', {
      playerId: player._id,
      at: Date.now(),
      kind: 'outpostFounded',
      hostCountry,
      specialization,
    });
    await reportChange(ctx, season._id, before, founded);
    await reassessDetection(ctx, season._id, founded);
    return { outpostId };
  },
});

/**
 * **Le métier d'un point se règle sur le point, tant qu'aucune passe ne s'en est servie.**
 *
 * La fondation part du clic droit et pose « relais » : le serveur exige un mot à l'insertion, et
 * ce mot ne peut plus être choisi sur la carte au moment où l'on plante (décision Pierre du
 * 29/08). Le panneau de l'avant-poste rattrape ce choix — et le referme dès qu'un départ a lu ce
 * point, parce que c'est là que les deux spécialisations s'engagent : `pacedMinutes` lit les
 * relais au départ et la détection passive réévalue les postes d'écoute aux événements.
 *
 * « S'en être servi » se mesure donc à un départ qui **passe à portée** : un mouvement à l'autre
 * bout du monde n'a rien lu de ce point-là, et sceller sur lui aurait scellé chaque avant-poste
 * dans la minute qui suit sa fondation.
 */
export const respecialize = mutation({
  args: {
    token: v.string(),
    outpostId: v.id('outposts'),
    specialization: SPECIALIZATION,
  },
  handler: async (ctx, { token, outpostId, specialization }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);

    const outpost = await ctx.db.get(outpostId);
    if (!outpost || outpost.playerId !== player._id) fail('UNKNOWN_OUTPOST', { outpostId });
    if (await specializationServed(ctx, outpost)) fail('SPECIALIZATION_SEALED', { outpostId });

    await ctx.db.patch(outpost._id, { specialization });
    await reassessDetection(ctx, season._id);
    return { outpostId: outpost._id };
  },
});

/** ADR 0019 §7: go there and stay — a slot like any other (ADR 0006), and the only order whose
 *  column has an address at the end of it. **`marchTo`, not `march`**: `march` is the corridor
 *  all three orders walk down, and the name was taken before the type existed. */
export const marchTo = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    point: LON_LAT,
  },
  handler: async (ctx, { token, origin, troopIds, point }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      aim: await aimOf(ctx, player._id, { kind: 'point', point }),
    });
  },
});

/**
 * **Entering a garrison is a march aimed at a building of one's own** (decisions 64b, 69a, 70b).
 * The same corridor, the same slot, the same detection and the same passes on the road: what
 * changes is the address at the end — `stationedAt` becomes the building, which is what lets
 * the infantry board the cargo moored at that port on its next order. No new type: `march`
 * already means « go there and stay », and `recall` was not brought back for it — its word says
 * a garrison coming home, and its landing hunts a barracks by region.
 */
export const enterGarrison = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    buildingId: v.id('buildings'),
  },
  handler: async (ctx, { token, origin, troopIds, buildingId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      aim: await aimOf(ctx, player._id, { kind: 'building', buildingId }),
    });
  },
});

export const attack = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: ATTACK_TARGET,
  },
  handler: async (ctx, { token, origin, troopIds, target }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'attack',
      origin,
      troopIds,
      aim: await aimOf(ctx, player._id, target),
    });
  },
});

/** ADR 0004: a raid marches at an outpost and nothing else, and winning the engagement is what
 *  deactivates it — one that fails to clear the garrison has walked for nothing. */
export const raid = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    outpostId: v.id('outposts'),
  },
  handler: async (ctx, { token, origin, troopIds, outpostId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'raid',
      origin,
      troopIds,
      aim: await aimOf(ctx, player._id, { kind: 'outpost', outpostId }),
    });
  },
});

/** Public S8 filing: the client names a surveyed installation, never its route or consequence. */
export const plunder = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    buildingId: v.id('buildings'),
  },
  handler: async (ctx, { token, origin, troopIds, buildingId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);
    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      aim: await surveyedPlunderAim(ctx, player, buildingId),
      plunder: { buildingId },
    });
  },
});

/** Public S8 filing: the private sighting is the sole target authority exposed to the client. */
export const collectLoot = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    sightingId: v.id('lootCrateSightings'),
  },
  handler: async (ctx, { token, origin, troopIds, sightingId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(player, season);
    return startLootCollectionMission(ctx, {
      playerId: player._id,
      sightingId,
      origin,
      troopIds,
    });
  },
});

/**
 * What the player sees before he pays: the route the march will store (ADR 0012) and the rest
 * window it would stall in (design sheet 07). **It refuses nothing** — the fan only ever offered
 * legal types (ADR 0015), and a query that failed would turn a hover into an error.
 */
export const preview = query({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: ATTACK_TARGET,
    type: MOVEMENT_TYPE,
  },
  handler: async (ctx, { token, origin, troopIds, target, type }) => {
    const { player } = await playerByToken(ctx, token);
    if (type === 'decoy') return null;
    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) return null;

    const troops = await troopsAmong(ctx, player._id, troopIds);
    const column = await columnOf(ctx, player._id, troops, departure);
    const pace = column.roles;

    const { aim, point, name, host } = await aimOf(ctx, player._id, target);
    if (refusalOf(type, aim, column) !== null) return null;
    const route = routeBetween(departure.point, point, routeModeOf(pace), landCostOf(pace));
    if (route === null) return null;

    const now = Date.now();
    const minutes = await pacedMinutes(ctx, player._id, route, now);
    const arrivesAt = now + minutes * 60_000;
    return {
      minutes,
      arrivesAt,
      /** The card owes the player the reason for an hour he did not expect: an acceleration
       *  nothing on screen accounts for reads as a bug, not as a reward. */
      relayed: routeMinutes(route.costUnits) - minutes,
      holdUntil: await restHold(ctx, player._id, host, arrivesAt),
      recognised: await recognises(ctx, player, point),
      troops: troopIds.length,
      type,
      destinationName: name,
      originName: departure.name,
      route: routeFacts(route),
    };
  },
});

const cargoPreviewOf = async (
  ctx: Parameters<typeof selectedStationedCargo>[0],
  player: Doc<'players'>,
  departure: NonNullable<Awaited<ReturnType<typeof departureOf>>>,
  troops: ReadonlyArray<Doc<'troops'>>,
) => {
  const loads = await selectedStationedCargo(ctx, {
    seasonId: player.seasonId,
    playerId: player._id,
    stationedAt: departure.stationId,
    troops,
  });
  const loot = cargoTotal(loads);
  const carried = RESOURCES.reduce((sum, resource) => sum + loot[resource], 0);
  const capacity = carryCapacityOf(
    troops.map((troop) => ({
      role: troop.role,
      strength: troop.currentStrength,
      nominalStrength: troop.nominalStrength,
    })),
    CARRY_CAPACITY_BY_ROLE,
  );
  return { loot, carried, capacity, free: Math.max(0, capacity - carried) };
};

const previewTroopsAt = async (
  ctx: Parameters<typeof troopsAmong>[0],
  playerId: Id<'players'>,
  troopIds: ReadonlyArray<Id<'troops'>>,
  departure: NonNullable<Awaited<ReturnType<typeof departureOf>>>,
) => {
  const troops = await troopsAmong(ctx, playerId, troopIds);
  const marching = new Set(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  return troops.length === troopIds.length &&
    troops.every(
      (troop) => sameStation(troop.stationedAt, departure.stationId) && !marching.has(troop._id),
    )
    ? troops
    : null;
};

/** L'aperçu de l'expédition. Il ne refuse rien : la rose n'a offert la branche que si
 *  `plunderOrderRefusalOf` l'a laissée passer, la même fonction que la mutation relit. */
export const previewPlunder = query({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    buildingId: v.id('buildings'),
  },
  handler: async (ctx, { token, origin, troopIds, buildingId }) => {
    const { player } = await playerByToken(ctx, token);
    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) return null;
    const troops = await previewTroopsAt(ctx, player._id, troopIds, departure);
    if (troops === null) return null;
    const column = await columnOf(ctx, player._id, troops, departure);
    const target = await surveyedPlunderTarget(ctx, player, buildingId);
    if (
      plunderRefusalOf(
        { kind: 'building', buildingId: target._id, key: target.key },
        column.roles,
        target.playerId === player._id,
      ) !== null
    ) {
      return null;
    }
    const point = pointOfBuilding(target);
    const region = regionFacts(target.regionId);
    if (point === null || region === null) return null;
    const route = routeBetween(
      departure.point,
      point,
      routeModeOf(column.roles),
      landCostOf(column.roles),
    );
    if (route === null) return null;
    const now = Date.now();
    const minutes = await pacedMinutes(ctx, player._id, route, now);
    const arrivesAt = now + minutes * 60_000;
    return {
      minutes,
      arrivesAt,
      holdUntil: await restHold(ctx, player._id, region.country, arrivesAt),
      destinationName: region.name,
      originName: departure.name,
      route: routeFacts(route),
      cargo: await cargoPreviewOf(ctx, player, departure, troops),
      effect:
        canonicalBuildingKey(target.key) === 'warehouse'
          ? ('loot' as const)
          : ('sabotage' as const),
      presenceHours: PLUNDER_HOURS_PRESENT,
      disabledHours: PLUNDER_DISABLED_HOURS,
    };
  },
});

/** The estimate is frozen from the owned sighting. The true crate is deliberately never read. */
export const previewLootCollection = query({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    sightingId: v.id('lootCrateSightings'),
  },
  handler: async (ctx, { token, origin, troopIds, sightingId }) => {
    const { player } = await playerByToken(ctx, token);
    const sighting = await ctx.db.get(sightingId);
    if (
      sighting === null ||
      sighting.playerId !== player._id ||
      sighting.seasonId !== player.seasonId ||
      !sighting.present
    ) {
      return null;
    }
    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) return null;
    const troops = await previewTroopsAt(ctx, player._id, troopIds, departure);
    if (troops === null) return null;
    const column = await columnOf(ctx, player._id, troops, departure);
    const aimed = await aimOf(ctx, player._id, { kind: 'point', point: sighting.point });
    if (refusalOf('march', aimed.aim, column) !== null) return null;
    const route = routeBetween(
      departure.point,
      aimed.point,
      routeModeOf(column.roles),
      landCostOf(column.roles),
    );
    if (route === null) return null;
    const cargo = await cargoPreviewOf(ctx, player, departure, troops);
    if (cargo.free <= 0) return null;
    const now = Date.now();
    const minutes = await pacedMinutes(ctx, player._id, route, now);
    const arrivesAt = now + minutes * 60_000;
    return {
      minutes,
      arrivesAt,
      holdUntil: await restHold(ctx, player._id, aimed.host, arrivesAt),
      destinationName: aimed.name,
      originName: departure.name,
      route: routeFacts(route),
      cargo,
      estimatedLoot: trimLootToCapacity(sighting.loot, cargo.free),
      seenAt: sighting.seenAt,
      current: sighting.current,
    };
  },
});

const routeFacts = (route: ComputedRoute) => ({
  mode: route.mode,
  points: route.points.map(asPoint),
  distanceUnits: route.distanceUnits,
  costUnits: route.costUnits,
  landCost: route.landCost,
  legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
});

/**
 * The far end of every movement (design sheet 07 for the rest window, ADR 0014 for the pass).
 * **A return never engages**, and that is a decision: the rout ended that engagement, and a
 * beaten column arriving in arms would be resolved twice for one defeat.
 */
export const arrive = internalMutation({
  args: { movementId: v.id('movements') },
  handler: async (ctx, { movementId }) => {
    const movement = await ctx.db.get(movementId);
    if (!movement) return;
    if (!(await seasonStillPlays(ctx, movement.playerId))) return;

    const now = Date.now();
    const held = await restHold(ctx, movement.playerId, movement.hostCountry, now);
    if (held !== null) {
      await ctx.db.patch(movementId, { arrivesAt: held });
      await ctx.scheduler.runAt(held, internal.movements.arrive, { movementId });
      /** Fiche 11 §4.1. Filed at the hold, once — the reschedule lands past the window, so it
       *  cannot file a second. */
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'movementStalled',
        hostCountry: movement.hostCountry,
        resolvesAt: held,
      });
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    if (movement.plunder?.phase === 'outbound') {
      await surveyAlongRoute(ctx, movement, now);
      await arriveForPlunder(ctx, movement, now);
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    if (movement.lootCollection !== undefined) {
      await resolveLootCollectionArrivals(ctx, movement, now);
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    /** A march that came to garrison a building enters it if it still stands and is still the
     *  player's; razed or lost since, the column stands on the point reached (rule 3) and the
     *  journal says so in the plain words of an arrival. */
    let garrisoned = false;
    if (movement.type === 'attack' || movement.type === 'raid') {
      await engageAt(ctx, movement, movement.type, now);
    } else if (movement.type === 'march') {
      const garrison = await garrisonOf(ctx, movement);
      const entered = await standAt(ctx, movement, now, garrison?._id ?? movement.to);
      if (garrison !== null && entered > 0) {
        garrisoned = true;
        await ctx.db.insert('notices', {
          playerId: movement.playerId,
          at: now,
          kind: 'garrisonEntered',
          building: garrison.key,
          regionId: garrison.regionId,
          troops: entered,
        });
      }
    } else if (movement.type === 'recall') await recallAt(ctx, movement);
    /** **Un leurre encore en vol le 29/08/2026 finit ici, et n'y fait rien** : il ne porte
     *  personne, donc `attachHome` ne rattache rien et `forgetMovement` l'efface. Une branche
     *  pour lui serait du code de leurre remis dans un jeu qui n'en a plus. */
    else {
      const home = await attachHome(ctx, movement);
      if (movement.type === 'return' && !(await completeLootDelivery(ctx, movement, now))) {
        await stationMovementLoot(ctx, movement, home);
      }
    }

    /** **The three arrivals nothing else accounts for**: the others leave an engagement or file
     *  their own notice. Without this a player came back to "rien à signaler" after eight quiet
     *  hours. */
    if (
      (movement.type === 'march' && !garrisoned) ||
      movement.type === 'recall' ||
      movement.type === 'return'
    ) {
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'columnArrived',
        movementType: movement.type,
        hostCountry: movement.hostCountry,
        troops: movement.troopIds.length,
      });
    }

    /** **Le couloir se relève à l'arrivée**, avant que le mouvement ne s'efface : c'est là que
     *  la colonne a vu ce qu'elle a traversé, et il n'y a plus de polyligne à lire ensuite. */
    await surveyAlongRoute(ctx, movement, now);
    await forgetMovement(ctx, movementId);
    await reassessDetection(ctx, movement.seasonId, now);
  },
});

export const completePlunderPresence = internalMutation({
  args: { movementId: v.id('movements'), expectedAt: v.number() },
  handler: async (ctx, { movementId, expectedAt }) => {
    const movement = await ctx.db.get(movementId);
    if (movement === null) return;
    await completePresence(ctx, movement, expectedAt);
    await reassessDetection(ctx, movement.seasonId);
  },
});

/** The opening of a future visibility window, still validated against its own ledger row. */
export const revealSighting = internalMutation({
  args: { sightingId: v.id('sightings') },
  handler: (ctx, { sightingId }) => revealScheduledSighting(ctx, sightingId),
});

/**
 * One predicted mobile encounter. Both manifests and the order-derived behaviour are reread at
 * the appointment; a stale callback only asks for a fresh assessment.
 */
export const encounter = internalMutation({
  args: {
    initiatorId: v.id('movements'),
    withId: v.id('movements'),
    expectedAt: v.number(),
  },
  handler: async (ctx, { initiatorId, withId, expectedAt }) => {
    const initiator = await ctx.db.get(initiatorId);
    const other = await ctx.db.get(withId);
    if (initiator === null && other === null) return;
    if (initiator === null) {
      await reassessDetection(ctx, other!.seasonId);
      return;
    }
    if (other === null) {
      await reassessDetection(ctx, initiator.seasonId);
      return;
    }
    if (
      initiator.contactWithId !== withId ||
      initiator.contactAt !== expectedAt ||
      initiator.contactInitiatorId !== initiatorId
    ) {
      await reassessDetection(ctx, initiator.seasonId);
      return;
    }
    if (initiator.seasonId !== other.seasonId || initiator.playerId === other.playerId) {
      await reassessDetection(ctx, initiator.seasonId);
      return;
    }

    const [mine, theirs] = await Promise.all([
      mobileForceOf(ctx, initiator),
      mobileForceOf(ctx, other),
    ]);
    const contact = firstMobileEncounter({
      a: mine.force,
      b: theirs.force,
      rangeA: mine.rangeKm,
      rangeB: theirs.rangeKm,
      engagesA: movementBehavior(initiator.type) === 'engage',
      engagesB: movementBehavior(other.type) === 'engage',
      after: expectedAt,
      samples: 1,
    });
    if (contact === null || contact.at !== expectedAt || contact.initiatorId !== initiatorId) {
      await reassessDetection(ctx, initiator.seasonId);
      return;
    }
    const attacking = await troopsCarriedBy(ctx, initiator);
    const defending = await troopsCarriedBy(ctx, other);
    if (attacking.length === 0 || defending.length === 0) {
      await reassessDetection(ctx, initiator.seasonId);
      return;
    }

    await ctx.db.patch(initiatorId, {
      contactJobId: undefined,
      contactWithId: undefined,
      contactAt: undefined,
      contactInitiatorId: undefined,
    });
    const now = Date.now();
    const { engagement, routed, routedCargo } = await resolveContact(ctx, {
      seasonId: initiator.seasonId,
      attacker: { playerId: initiator.playerId, troops: attacking },
      defender: { playerId: other.playerId, troops: defending },
      cause: 'interception',
      point: asPoint(contact.point),
      hostCountry: hostAtPoint(contact.point),
      outpostId: null,
      disabledUntil: null,
      at: now,
    });

    const standing = new Set(
      engagement.outcomes
        .filter((outcome) => outcome.state === 'standing')
        .map((outcome) => outcome.id),
    );
    for (const [movement, met] of [
      [initiator, other._id],
      [other, initiator._id],
    ] as const) {
      const carriedOn = movement.troopIds.filter((troopId) => standing.has(troopId));
      if (carriedOn.length === 0) await forgetMovement(ctx, movement._id);
      else {
        await ctx.db.patch(movement._id, {
          troopIds: carriedOn,
          encounteredMovementIds: [...new Set([...(movement.encounteredMovementIds ?? []), met])],
        });
      }
    }
    await walkHome(ctx, { winners: [], beaten: routed }, contact.point, now, routedCargo);
    await reassessDetection(ctx, initiator.seasonId, now);
  },
});

/** Legacy callback kept until the next wipe so already scheduled fixed-radius jobs become a
 * harmless reassessment instead of resolving a forbidden stationary interception. */
export const intercept = internalMutation({
  args: {
    movementId: v.id('movements'),
    by: CONTACT_FORCE,
    point: LON_LAT,
  },
  handler: async (ctx, { movementId, by, point }) => {
    const movement = await ctx.db.get(movementId);
    if (!movement) return;
    void by;
    void point;
    await reassessDetection(ctx, movement.seasonId);
  },
});
