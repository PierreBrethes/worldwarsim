import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import {
  boardingRefusalDetails,
  boardingRefusalOf,
  disembarkRefusalOf,
  foundingRefusal,
  landCostOf,
  plunderRefusalOf,
  refusalOf,
  routeModeOf,
} from '../src/domain/movement-orders';
import { carryCapacityOf, trimLootToCapacity } from '../src/domain/loot';
import { captureDurationAt, captureRate } from '../src/domain/capture';
import { modeOf } from '../src/domain/season-mode';
import { canonicalBuildingKey, RESOURCES } from '../src/domain/ids';
import { carrierIn } from '../src/domain/troops';
import type { ComputedRoute } from '../src/domain/routing';
import { playerBuildings } from './buildingReads';
import {
  cargoTotal,
  selectedStationedCargo,
  stationCargoLoads,
  stationMovementLoot,
  takeStationedCargo,
} from './cargo';
import {
  CARRY_CAPACITY_BY_ROLE,
  PLUNDER_DISABLED_HOURS,
  PLUNDER_HOURS_PRESENT,
  buildCost,
  routeMinutes,
} from './constants';
import { foundationMinutes, scheduleStand } from './outposts';
import { debit } from './resources';
import { fail } from './errors';
import {
  attachHome,
  engageAt,
  forgetMovement,
  garrisonOf,
  outpostGarrisonOf,
  recallAt,
  standAt,
} from './movement/arrival';
import {
  asPoint,
  movementsOf,
  onAirfield,
  pointOf,
  recognises,
  seatedOf,
  specializationServed,
  standingPile,
} from './movement/forces';
import {
  aimOf,
  captureAimOf,
  columnOf,
  departureOf,
  march,
  namesATroopTwice,
  sameStation,
  plunderAimOf,
  surveyedPlunderTarget,
  troopsAmong,
  fuelBill,
} from './movement/orders';
import { resupply, toppedUp } from './supplies';
import { arriveToDeliver, arriveToAirdrop } from './logistics';
import { arriveAtBase, arriveOnTour } from './tours';
import { pacedMinutes } from './movement/pace';
import { reassessDetection, revealSighting as revealScheduledSighting } from './movement/detection';
import { nearestRegion, regionFacts } from './regions';
import { surveyAlongRoute } from './surveys';
import { hostAtPoint, landAtPoint, routeBetween } from './routes';
import { playerOf, requirePlayable, seasonStillPlays } from './seats';
import { arriveForPlunder, completeLootDelivery, completePresence } from './plunder';
import { resolveLootCollectionArrivals, startLootCollectionMission } from './lootCollections';
import { restHold } from './movement/rest';
import { pursue as pursueStep, quarryOf } from './movement/pursuit';
import { blitzTheatreOf } from './movement/theatre';
import { bombard as bombardFrom } from './movement/bombard';
import { firesIndirect } from '../src/domain/indirect-fire';
import { arriveForCapture } from './captures';

export { restHold } from './movement/rest';
import {
  ATTACK_TARGET,
  CAPTURE_TARGET,
  LON_LAT,
  MOVEMENT_ORIGIN,
  MOVEMENT_TYPE,
  SPECIALIZATION,
} from './validators';
import { isBlitz, occupiedBuildingIds, refuseInBlitz } from './blitz';

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
    seasonId: v.id('seasons'),
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
  handler: async (ctx, { token, seasonId, point, regionId, specialization, troopIds }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    if (namesATroopTwice(troopIds)) fail('DUPLICATE_TROOP');

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
    /** **Le sol se lit sur la grille de routage** (règle 5 du 18/09), la même cellule que la
     *  visée a lue : le large n'ouvre aucun terrain, et il passait jusque-là *parce que* le sol
     *  de personne satisfaisait la seule condition que la fondation posait. */
    const refusal = foundingRefusal(
      troops.map((troop) => troop.role),
      here !== null && buildings.some((building) => building.regionId === here.id),
      landAtPoint(pointOf(point)),
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
     * **Fonder se paie, et le stock répond avant le sol** (révision du 15/09 de l'ADR 0020 §10).
     * Le prix est celui d'un avant-poste de niveau 1, le même barème que son élévation, et le
     * refus est celui de `debit` — la rose lit la même facture, donc la branche n'existe pas
     * quand la matière manque (ADR 0015).
     */
    const founded = Date.now();
    const cost = buildCost('outpost', 1);
    await debit(ctx, player._id, cost, founded);

    /**
     * **Rien ne change de couleur à l'ordre** : ce qui s'insère est un chantier, et un chantier
     * ne tient rien (`isStanding`). Le règlement des stocks à l'ancienne couleur se fait au
     * **lever** (`outposts.standOutpost`), qui est l'instant où la couleur bouge pour de bon —
     * régler ici l'appliquerait des heures trop tôt.
     *
     * Ce que cette fenêtre achète : un camp posé et visible (ADR 0024 §1) sur un point qui
     * n'existe pas encore, donc un voisin qui peut réagir. Sans elle, la fondation était le
     * seul geste du jeu sans contre-coup possible.
     */
    const standsAt = founded + foundationMinutes() * 60_000;
    const outpostId = await ctx.db.insert('outposts', {
      seasonId: season._id,
      playerId: player._id,
      ...ground,
      level: 1,
      specialization,
      foundedAt: founded,
      standsAt,
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
    /** **Aucun relevé à l'ordre** : un chantier ne tient pas ce sol, donc il n'a rien à en
     *  relever — c'est le lever qui est le point d'échantillonnage (ADR 0020 §5). */
    await ctx.db.insert('notices', {
      playerId: player._id,
      at: founded,
      kind: 'outpostFounded',
      hostCountry,
      point,
      specialization,
    });
    await scheduleStand(ctx, outpostId, standsAt);
    /** La garnison a changé d'adresse : ce qu'elle voit et ce qu'on voit d'elle bouge, même si
     *  le point, lui, ne voit encore rien. */
    await reassessDetection(ctx, season._id, founded);
    return { outpostId, cost, standsAt };
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
    seasonId: v.id('seasons'),
    outpostId: v.id('outposts'),
    specialization: SPECIALIZATION,
  },
  handler: async (ctx, { token, seasonId, outpostId, specialization }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
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
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    boardsOn: v.optional(v.id('troops')),
    point: LON_LAT,
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, point, boardsOn }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      boardsOn,
      aim: await aimOf(ctx, player._id, { kind: 'point', point }),
    });
  },
});

/**
 * **Embarquer** (ADR 0025, révisée le 15/10) : des troupes terrestres posées au point d'un
 * transport y montent, sur-le-champ — aucun mouvement, aucun slot. De plus loin, c'est une marche
 * qui embarque en arrivant (`boardsOn`). La règle est `boardingRefusalOf`, celle que le geste a
 * lue avant le lâcher.
 */
export const board = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    troopIds: v.array(v.id('troops')),
    carrierId: v.id('troops'),
  },
  handler: async (ctx, { token, seasonId, troopIds, carrierId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (namesATroopTwice(troopIds)) fail('DUPLICATE_TROOP');
    const carrier = await ctx.db.get(carrierId);
    if (!carrier || carrier.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId: carrierId });
    const pile = await standingPile(ctx, player._id, carrier.stationedAt);
    const standing = (troopId: Id<'troops'>) =>
      pile.find((troop) => troop._id === troopId) ?? fail('TROOP_NOT_AT_ORIGIN', { troopId });
    standing(carrierId);
    const riders = troopIds.map(standing);
    const boarding = {
      riders: riders.map(seatedOf),
      carrier: seatedOf(carrier),
      pile: pile.map(seatedOf),
      atAirfield: await onAirfield(ctx, carrier.stationedAt),
    };
    const refusal = boardingRefusalOf(boarding);
    if (refusal !== null) fail(refusal, boardingRefusalDetails(boarding));
    /** Monter à bord déplace la pièce : sa mise en batterie repart (B20). */
    for (const rider of riders)
      await ctx.db.patch(rider._id, {
        carriedBy: carrierId,
        ...(firesIndirect(rider.role) ? { settledAt: Date.now() } : {}),
      });
    return { boarded: riders.length };
  },
});

/**
 * **Débarquer** (15/10) : des passagers mettent pied à terre au point de leur transport, et y
 * restent — à côté de lui, libres. Jamais au large, et d'un avion dans un aérodrome seulement
 * (`disembarkRefusalOf`, la règle même de la rose).
 */
export const disembark = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), troopIds: v.array(v.id('troops')) },
  handler: async (ctx, { token, seasonId, troopIds }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    if (namesATroopTwice(troopIds)) fail('DUPLICATE_TROOP');
    for (const troopId of troopIds) {
      const troop = await ctx.db.get(troopId);
      if (!troop || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
      const pile = await standingPile(ctx, player._id, troop.stationedAt);
      if (!pile.some((one) => one._id === troopId)) fail('TROOP_NOT_AT_ORIGIN', { troopId });
      const address = troop.stationedAt;
      const refusal = disembarkRefusalOf({
        carrier: carrierIn(seatedOf(troop), pile.map(seatedOf))?.role ?? null,
        afloat:
          address !== null &&
          typeof address !== 'string' &&
          !landAtPoint([address.lon, address.lat]),
        atAirfield: await onAirfield(ctx, address),
      });
      if (refusal !== null) fail(refusal, { troopId });
      await ctx.db.patch(troopId, { carriedBy: undefined });
    }
    return { disembarked: troopIds.length };
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
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    boardsOn: v.optional(v.id('troops')),
    buildingId: v.id('buildings'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, buildingId, boardsOn }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      boardsOn,
      aim: await aimOf(ctx, player._id, { kind: 'building', buildingId }),
    });
  },
});

/**
 * **On entre dans son propre point comme dans un mât** (décision de Pierre, 16/09). Jumelle
 * d'`enterGarrison` : la même marche, la même règle, une autre sorte d'adresse au bout — et
 * l'appartenance n'est pas vérifiée ici mais dans `refusalOf`, qui refuse `POINT_TARGET_ONLY`
 * sur un point qui n'est pas dans `myOutpostIds`. Une seconde vérification serait une seconde
 * règle (ADR 0015).
 */
export const enterOutpost = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    boardsOn: v.optional(v.id('troops')),
    outpostId: v.id('outposts'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, outpostId, boardsOn }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      boardsOn,
      aim: await aimOf(ctx, player._id, { kind: 'outpost', outpostId }),
    });
  },
});

export const attack = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: ATTACK_TARGET,
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, target }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    /** **En Blitz l'attaque vise une unité, et la poursuit** (B18). Hors Blitz, ou sur ce qui
     *  n'est pas une unité, `refusalOf` dit le mot — la troupe n'est cherchée que si elle compte. */
    const chasing =
      (await blitzTheatreOf(ctx, player._id)) !== null &&
      (target.kind === 'camp' || target.kind === 'track');
    /** **On poursuit ce qu'on voit à l'instant** : la vue refaite avant de la lire, comme à
     *  chaque regard de la poursuite. */
    if (chasing) await reassessDetection(ctx, seasonId, Date.now());
    const hunted = chasing ? await quarryOf(ctx, player._id, target, Date.now()) : null;
    return march(ctx, {
      playerId: player._id,
      season,
      type: 'attack',
      origin,
      troopIds,
      aim: await aimOf(ctx, player._id, target),
      ...(hunted === null ? {} : { pursuit: { troopId: hunted.troopId } }),
    });
  },
});

/** **Bombarder** (B20) : l'artillerie tire sur une unité en vue, sur-le-champ, sans mouvement. */
export const bombard = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    troopId: v.id('troops'),
    target: v.union(
      v.object({ kind: v.literal('camp'), campId: v.id('campSightings') }),
      v.object({ kind: v.literal('track'), movementId: v.id('movements') }),
    ),
  },
  handler: async (ctx, { token, seasonId, troopId, target }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    return bombardFrom(ctx, player, troopId, target);
  },
});

/** ADR 0004: a raid marches at an outpost and nothing else, and winning the engagement is what
 *  deactivates it — one that fails to clear the garrison has walked for nothing. */
export const raid = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    outpostId: v.id('outposts'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, outpostId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
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
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    buildingId: v.id('buildings'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, buildingId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    const target = await surveyedPlunderTarget(ctx, player, buildingId);
    return march(ctx, {
      playerId: player._id,
      season,
      type: 'march',
      origin,
      troopIds,
      aim: plunderAimOf(target),
      plunder: { buildingId, surveyed: { key: target.key, regionId: target.regionId } },
    });
  },
});

/**
 * **Capturer** (décision du 14/10) : un bâtiment adverse relevé, ou un avant-poste adverse. La
 * colonne y marche comme à une attaque ; l'arrivée engage, puis l'infanterie debout capture
 * (`captures.ts`). Le refus est celui de la rose (`captureOrderRefusalOf`).
 */
export const capture = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: CAPTURE_TARGET,
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, target }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    return march(ctx, {
      playerId: player._id,
      season,
      type: 'attack',
      origin,
      troopIds,
      aim: await captureAimOf(ctx, player, target),
      capture: target,
    });
  },
});

/** Public S8 filing: the private sighting is the sole target authority exposed to the client. */
export const collectLoot = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    sightingId: v.id('lootCrateSightings'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, sightingId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
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
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: ATTACK_TARGET,
    type: MOVEMENT_TYPE,
    /** **Un largage** (ADR 0028 §4) : le plein de l'aller-retour, dit avant le lâcher. */
    roundTrip: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, target, type, roundTrip }) => {
    const { player } = await playerOf(ctx, token, seasonId);
    if (type === 'decoy' || namesATroopTwice(troopIds)) return null;
    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) return null;

    const now = Date.now();
    /** L'aperçu lit la troupe comme le départ la lira : rechargée si elle est ancrée. */
    const { troops } = await toppedUp(
      ctx,
      player._id,
      await troopsAmong(ctx, player._id, troopIds),
      now,
    );
    const column = await columnOf(ctx, player._id, troops, departure);
    const pace = column.roles;

    const { aim, point, name, host } = await aimOf(ctx, player._id, target);
    if (refusalOf(type, aim, column) !== null) return null;
    const route = routeBetween(departure.point, point, routeModeOf(pace), landCostOf(pace));
    if (route === null) return null;

    const minutes = await pacedMinutes(ctx, player._id, route, now);
    const arrivesAt = now + minutes * 60_000;
    return {
      minutes,
      arrivesAt,
      /** The card owes the player the reason for an hour he did not expect: an acceleration
       *  nothing on screen accounts for reads as a bug, not as a reward. */
      relayed: column.blitz === undefined ? routeMinutes(route.costUnits) - minutes : 0,
      holdUntil: await restHold(ctx, player._id, host, arrivesAt),
      recognised: await recognises(ctx, player, point),
      troops: troopIds.length,
      type,
      destinationName: name,
      originName: departure.name,
      route: routeFacts(route),
      /** **Le plein que la route coûte** (ADR 0028 §3), et le refus avant le clic s'il manque. */
      fuel: fuelFacts(troops, route, column, roundTrip === true),
      /** L'heure est celle d'un point : en Blitz une attaque poursuit, et la carte le dit. */
      pursuit:
        type === 'attack' &&
        column.blitz !== undefined &&
        (target.kind === 'camp' || target.kind === 'track'),
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
  if (namesATroopTwice(troopIds)) return null;
  const troops = await troopsAmong(ctx, playerId, troopIds);
  const marching = new Set(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  if (
    troops.length !== troopIds.length ||
    !troops.every(
      (troop) => sameStation(troop.stationedAt, departure.stationId) && !marching.has(troop._id),
    )
  )
    return null;
  /** L'aperçu lit la troupe comme le départ la lira : rechargée si elle est ancrée. */
  return (await toppedUp(ctx, playerId, troops, Date.now())).troops;
};

/** **Le plein que la route coûte** (ADR 0028 §3), et son refus avant le clic s'il manque. */
const fuelFacts = (
  troops: ReadonlyArray<Doc<'troops'>>,
  route: ComputedRoute,
  column: { readonly blitz?: unknown },
  roundTrip = false,
) => {
  const { steps, short, km } = fuelBill(
    troops,
    route.distanceUnits,
    column.blitz !== undefined,
    roundTrip,
  );
  return { steps, short, km, roundTrip };
};

/** L'aperçu de l'expédition. Il ne refuse rien : la rose n'a offert la branche que si
 *  `plunderOrderRefusalOf` l'a laissée passer, la même fonction que la mutation relit. */
export const previewPlunder = query({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    buildingId: v.id('buildings'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, buildingId }) => {
    const { player } = await playerOf(ctx, token, seasonId);
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
        false,
      ) !== null
    ) {
      return null;
    }
    const point = target.point;
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
      fuel: fuelFacts(troops, route, column),
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

/** L'aperçu d'une capture : la route, l'heure, et la durée à pleine force que le serveur datera.
 *  Il ne refuse rien — la rose n'a offert la branche que si `captureOrderRefusalOf` l'a permise. */
export const previewCapture = query({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: CAPTURE_TARGET,
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, target }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) return null;
    const troops = await previewTroopsAt(ctx, player._id, troopIds, departure);
    if (troops === null) return null;
    const column = await columnOf(ctx, player._id, troops, departure);
    const aimed = await captureAimOf(ctx, player, target);
    const route = routeBetween(
      departure.point,
      aimed.point,
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
      holdUntil: await restHold(ctx, player._id, aimed.host, arrivesAt),
      destinationName: aimed.name,
      originName: departure.name,
      route: routeFacts(route),
      fuel: fuelFacts(troops, route, column),
      captureMinutes:
        captureDurationAt(
          modeOf(season.mode),
          aimed.aim.kind === 'building' ? aimed.aim : { kind: 'outpost' },
          captureRate(
            troops.map((troop) => ({
              role: troop.role,
              strength: troop.currentStrength,
              nominalStrength: troop.nominalStrength,
            })),
          ),
          season.hqCaptureHours,
        ) / 60_000,
    };
  },
});

/** The estimate is frozen from the owned sighting. The true crate is deliberately never read. */
export const previewLootCollection = query({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    sightingId: v.id('lootCrateSightings'),
  },
  handler: async (ctx, { token, seasonId, origin, troopIds, sightingId }) => {
    const { player } = await playerOf(ctx, token, seasonId);
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
      fuel: fuelFacts(troops, route, column),
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
      await ctx.db.patch(movementId, { arrivesAt: held, heldAt: now });
      await ctx.scheduler.runAt(held, internal.movements.arrive, { movementId });
      /** Fiche 11 §4.1. Filed at the hold, once — the reschedule lands past the window, so it
       *  cannot file a second. */
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'movementStalled',
        hostCountry: movement.hostCountry,
        point: movement.to,
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

    if (movement.capture !== undefined) {
      await surveyAlongRoute(ctx, movement, now);
      await arriveForCapture(ctx, movement, now);
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    if (movement.lootCollection !== undefined) {
      await resolveLootCollectionArrivals(ctx, movement, now);
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    /**
     * **Le couloir se relève avant que la résolution ne parle** (retours du 11/09, ligne 5) : la
     * dépêche d'une colonne bredouille nomme l'installation adverse que le joueur a sur place, et
     * elle ne peut la nommer que si le relevé de ce couloir-ci est déjà écrit. C'est l'ordre que
     * la branche du pillage tient depuis le début, et la polyligne est la même à un pas près.
     */
    await surveyAlongRoute(ctx, movement, now);

    /** **Un pas de tournée** (ADR 0028) : il décharge et file au suivant, ou recharge et repart. */
    if (movement.tourLeg !== undefined) {
      if (movement.tourLeg === 'stop') await arriveOnTour(ctx, movement, now);
      else await arriveAtBase(ctx, movement, now);
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    /** **Un largage lâche son paquet et rentre sans se poser** (ADR 0028 §4). */
    if (movement.airdrop?.leg === 'out') {
      await arriveToAirdrop(ctx, movement, now);
      await reassessDetection(ctx, movement.seasonId, now);
      return;
    }

    /** **Une livraison décharge et rentre** (ADR 0028 §4) ; sur un point perdu ou tombé entre-temps,
     *  elle arrive comme une marche. */
    if (movement.delivery !== undefined && (await arriveToDeliver(ctx, movement, now))) {
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
      const door = await garrisonOf(ctx, movement);
      /** **Une unité par bâtiment** (B15) : une autre de mes troupes y est entrée la première,
       *  celle-ci se pose à la porte — sauf à venir monter dans le transport qui la tient. */
      const carrier = movement.boardsOn === undefined ? null : await ctx.db.get(movement.boardsOn);
      const garrison =
        door !== null &&
        carrier?.stationedAt !== door._id &&
        (await isBlitz(ctx, movement.seasonId)) &&
        (await occupiedBuildingIds(ctx, movement.playerId, movement.troopIds)).has(door._id)
          ? null
          : door;
      /** **Une marche sur un point à soi y entre** (décision du 16/09) : la seule marche que
       *  `refusalOf` laisse viser un avant-poste est celle-là. Démantelé ou perdu entre-temps,
       *  la colonne se pose au point atteint comme n'importe quelle marche (règle 3). */
      const post = garrison === null ? await outpostGarrisonOf(ctx, movement) : null;
      const entered = await standAt(ctx, movement, garrison?._id ?? post?._id ?? movement.to);
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
        point: movement.to,
        troops: movement.troopIds.length,
      });
    }

    await forgetMovement(ctx, movementId);
    /** **Arrivée à l'ancre, elle se recharge** (ADR 0028 §3) : la pièce dit ses crans pleins dès
     *  qu'elle est posée, et non au prochain ordre. Une colonne repartie chez elle roule encore. */
    const landed = await troopsAmong(ctx, movement.playerId, movement.troopIds);
    await resupply(ctx, movement.playerId, landed, now);
    await reassessDetection(ctx, movement.seasonId, now);
  },
});

/** **Un regard de poursuite** (Blitz, B18) : frapper, abandonner, ou recourber la route. */
export const pursue = internalMutation({
  args: { movementId: v.id('movements'), expectedAt: v.number() },
  handler: async (ctx, { movementId, expectedAt }) => {
    const movement = await ctx.db.get(movementId);
    if (movement === null || !(await seasonStillPlays(ctx, movement.playerId))) return;
    await pursueStep(ctx, movementId, expectedAt);
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
