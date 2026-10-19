/**
 * Filing a departure: resolve the aim and the origin, claim the slot, refuse or route, insert
 * the row and hand it to the fog. One rule decides what may be ordered — `refusalOf` in
 * `src/domain/movement-orders.ts`, the very function the compass rose filters its fan with
 * (ADR 0015) — the slots come from the headquarters (ADR 0006), and the pace is read once, at
 * departure, relays included (ADR 0018 §3).
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { LonLat } from '../../src/domain/geo';
import {
  captureOrderRefusalOf,
  isPlunderTarget,
  plunderOrderRefusalOf,
  isMaritime,
  movementSlots,
  refusalDetails,
  refusalOf,
  landCostOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from '../../src/domain/movement-orders';
import { seasonPoints } from '../strategicPoints';
import { carriesSurveyedInstallation } from '../../src/domain/objectives';
import { withinTheatre } from '../../src/domain/blitz';
import { buildingLevel } from '../buildingReads';
import { MAX_HQ_LEVEL } from '../constants';
import { isAirStop } from '../../src/domain/logistics';
import { fail } from '../errors';
import { movementCargoFields, takeStationedCargo } from '../cargo';
import { regionAtRoutePoint } from '../regionGeometry';
import { regionNameAt } from '../placeNames';
import { pointOfBuilding, regionFacts } from '../regions';
import { coastAtPoint, hostAtPoint, landAtPoint, routeBetween } from '../routes';
import { surveyFromPoint } from '../surveys';
import { collapseIfAbandoned } from '../outposts';
import { reassessDetection } from './detection';
import { pacedMinutes } from './pace';
import { blitzTheatreOf } from './theatre';
import { quarryOf, schedulePursuit } from './pursuit';
import { occupiedBuildingIds } from '../blitz';
import {
  asPoint,
  movementsOf,
  outpostsOf,
  pointOf,
  seatedOf,
  standingPile,
  type TroopAddress,
} from './forces';
import { carrierIn, cargoOf, PROJECTION_BY_DOMAIN, seatLoose } from '../../src/domain/troops';
import {
  fuelRefusalOf,
  fuelStepsFor,
  fullSupplies,
  outOfRounds,
  suppliesOf,
} from '../../src/domain/supplies';
import { KM_PER_UNIT } from '../../src/domain/routing';
import { resupply } from '../supplies';

/** ADR 0019 §1: a building, the outpost a column garrisons, or the plain point it was left
 *  standing on. Exactly one of the three, never two, never none. */
export type MarchOrigin =
  | { readonly kind: 'building'; readonly buildingId: Id<'buildings'> }
  | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> }
  | { readonly kind: 'point'; readonly point: { readonly lon: number; readonly lat: number } };

/** `regionId` is `null` for an outpost, and that null is the rule rather than a hole: ADR 0019
 *  §2, a garrison walks, it does not embark. */
type Departure = {
  readonly point: LonLat;
  readonly name: string;
  readonly regionId: string | null;
  /** The address the troops must already be standing at to be ordered out of it. */
  readonly stationId: TroopAddress;
  /** What a return walks back to — an outpost keeps its garrison on the spot and needs none. */
  readonly fromBuildingId: Id<'buildings'> | null;
  /**
   * **Read off the point, once, here, on the routing grid** — the very cell `onLand` was read on
   * when the point was aimed at. It used to be read off the polygon (`hostAtPoint === ''`), and
   * the two disagree on every coastal strip narrower than half a cell: land for the polygon, sea
   * for the grid. A hull sent there was accepted — the target is not on land — and never left,
   * asked for a quay on water. One geometry per question, and this question is the grid's.
   * A building and an outpost stand on ground by construction.
   */
  readonly afloat: boolean;
  /**
   * **La plage d'où une coque repart** (ADR 0019 §2, révision du 04/09). Une colonne débarquée
   * se tient sur un point de côte : elle y est arrivée par la mer, et lui réclamer un quai
   * l'échouerait là pour la saison. Un bâtiment porte déjà sa porte (`false`) ; un avant-poste
   * côtier est une côte, d'où le cargo qui s'y est chargé repart (ADR 0028 §4).
   */
  readonly coastal: boolean;
  /** **L'escale aérienne** (ADR 0028 §5) : un avant-poste de niveau 2 est un aérodrome pour
   *  l'avion qui en repart. */
  readonly airStop?: boolean;
};

export async function departureOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  origin: MarchOrigin,
): Promise<Departure | null> {
  if (origin.kind === 'outpost') {
    const outpost = await ctx.db.get(origin.outpostId);
    if (!outpost || outpost.playerId !== playerId) return null;
    return {
      point: pointOf(outpost.point),
      /** A code, never a phrase (ADR 0016): the same `hostCountry` a stored movement falls back
       *  to when it left no building behind (`view.ts`). */
      name: outpost.hostCountry,
      regionId: null,
      stationId: outpost._id,
      fromBuildingId: null,
      afloat: false,
      /** **Un point côtier est une côte** : un cargo qui s'y est chargé en repart (ADR 0028 §4). */
      coastal: coastAtPoint(pointOf(outpost.point)),
      airStop: isAirStop(outpost.level),
    };
  }
  if (origin.kind === 'point') {
    /** **A place is not a thing, so there is nothing to own here**: what makes the order
     *  legitimate is that `march` checks the troops address by address. No building, no gate. */
    const point = pointOf(origin.point);
    return {
      point,
      name: regionNameAt(point) ?? hostAtPoint(point),
      regionId: null,
      stationId: origin.point,
      fromBuildingId: null,
      afloat: !landAtPoint(point),
      coastal: coastAtPoint(point),
    };
  }
  const building = await ctx.db.get(origin.buildingId);
  if (!building || building.playerId !== playerId) return null;
  const region = regionFacts(building.regionId);
  const stand = pointOfBuilding(building);
  if (!region || stand === null) return null;
  return {
    point: stand,
    name: region.name,
    regionId: building.regionId,
    stationId: building._id,
    fromBuildingId: building._id,
    afloat: false,
    coastal: false,
  };
}

/** **Two addresses are the same when they name the same place.** The point is compared as it was
 *  written — nothing rounds, because an address is copied, never re-measured. */
export const sameStation = (a: TroopAddress, b: TroopAddress): boolean => {
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.lon === b.lon && a.lat === b.lat;
};

/** A target resolved to a place. The **legality** of marching there is not decided here — see
 *  `refusalOf` and ADR 0015. */
export type Aimed = {
  readonly aim: MovementAim;
  /** The same target in the shape the table stores, brand and all — `MovementAim` is domain
   *  data and knows nothing of Convex ids. */
  readonly target: Doc<'movements'>['target'];
  readonly point: LonLat;
  readonly name: string;
  /** It travels with the target rather than being read back off the aim, because a **point**
   *  does not carry it: only the geometry knows. The open sea alone answers `''`. */
  readonly host: string;
};

/** An expedition target as the observer's survey holds it — never the building's own row. */
export type SurveyedPlunderTarget = {
  readonly _id: Id<'buildings'>;
  readonly key: Doc<'buildings'>['key'];
  readonly regionId: string;
  readonly point: LonLat;
};

/**
 * **The survey answers, not the board.** An expedition is filed against what this player has
 * surveyed, and what stands there *now* is not asked: refusing a target that was razed or put
 * out of service since told the player, from his armchair and for free, what only the ground
 * should (ADR 0005) — the length of a sabotage he did not carry out. The truth is read at
 * arrival (`plunderTargetAt`), and the column that finds nothing says so (`plunder.ts`).
 *
 * What is still read off the row is what never changes under an order: whose it is and which
 * season it stands in. A razed building is marched at by its region's point, the only place the
 * survey can still name.
 */
export async function surveyedPlunderTarget(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
): Promise<SurveyedPlunderTarget> {
  const target = await surveyedTarget(ctx, player, buildingId);
  if (!isPlunderTarget(target.key)) fail('UNKNOWN_BUILDING');
  return target;
}

/** Any installation of somebody else's that this player has surveyed, whatever it is. */
export async function surveyedTarget(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
): Promise<SurveyedPlunderTarget> {
  const surveys = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayerHasInstallations', (q) =>
      q.eq('playerId', player._id).eq('hasInstallations', true),
    )
    .collect();
  const seen = surveys
    .flatMap((survey) =>
      (survey.installations ?? []).map((installation) => ({
        ...installation,
        regionId: survey.regionId,
      })),
    )
    .find((installation) => installation.buildingId === buildingId);
  if (seen === undefined) fail('UNKNOWN_BUILDING');

  const building = await ctx.db.get(buildingId);
  if (
    building !== null &&
    (building.seasonId !== player.seasonId || building.playerId === player._id)
  ) {
    fail('UNKNOWN_BUILDING');
  }
  return {
    _id: buildingId,
    key: seen.key,
    regionId: seen.regionId,
    point: pointOfBuilding(building ?? seen),
  };
}

/** A surveyed enemy installation is an aim only for plunder; normal building aims stay mine. */
export function plunderAimOf(target: SurveyedPlunderTarget): Aimed {
  const region = regionFacts(target.regionId);
  if (region === null || target.point === null) fail('UNKNOWN_BUILDING');
  return {
    aim: { kind: 'building', buildingId: target._id, key: target.key },
    target: { kind: 'building', buildingId: target._id },
    point: target.point,
    name: region.name,
    host: region.country,
  };
}

/**
 * **Ce qu'une capture vise** : un bâtiment adverse que ce joueur a relevé — la même porte que le
 * pillage, sans la restriction de clé —, ou un avant-poste adverse, visé comme une attaque le vise.
 */
export async function captureAimOf(
  ctx: QueryCtx,
  player: Doc<'players'>,
  target: NonNullable<Doc<'movements'>['capture']>,
): Promise<Aimed> {
  if (target.kind === 'building') {
    /** **Un neutre de la Blitz est public** : il se vise sans relevé, comme un objectif. */
    const neutral = await neutralBuilding(ctx, player, target.buildingId);
    if (neutral !== null) {
      return plunderAimOf({
        _id: neutral._id,
        key: neutral.key,
        regionId: neutral.regionId,
        point: pointOfBuilding(neutral),
      });
    }
    return plunderAimOf(await surveyedTarget(ctx, player, target.buildingId));
  }
  if (target.kind === 'point') {
    const aimed = await aimOf(ctx, player._id, { kind: 'strategic', pointId: target.pointId });
    if ((await ctx.db.get(target.pointId))?.holderId === player._id) fail('FRIENDLY_TARGET');
    return aimed;
  }
  const aimed = await aimOf(ctx, player._id, { kind: 'outpost', outpostId: target.outpostId });
  if ((await ctx.db.get(target.outpostId))?.playerId === player._id) fail('FRIENDLY_TARGET');
  return aimed;
}

async function neutralBuilding(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
): Promise<Doc<'buildings'> | null> {
  const building = await ctx.db.get(buildingId);
  if (building === null || building.seasonId !== player.seasonId) return null;
  /** **Neutre de départ, même pris depuis** : la liste se sert figée (`neutralSitesOf`), et
   *  refuser l'ordre apprendrait la prise ; l'arrivée lit la vérité. */
  return building.startedNeutral === true && building.playerId !== player._id ? building : null;
}

/** Arrival revalidation is internal state handling: it never returns a reason or a target view. */
export async function revalidatePlunderTarget(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
  at = Date.now(),
): Promise<Doc<'buildings'>> {
  const building = await plunderTargetAt(ctx, player, buildingId, at);
  if (building === null) fail('UNKNOWN_BUILDING');
  return building;
}

/** One truth gate for filing, arrival and take. The opaque wrappers decide only whether the
 * caller needs an error or a no-op return. */
export async function plunderTargetAt(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
  at: number,
): Promise<Doc<'buildings'> | null> {
  const building = await ctx.db.get(buildingId);
  if (
    building === null ||
    building.seasonId !== player.seasonId ||
    building.playerId === player._id ||
    !isPlunderTarget(building.key) ||
    (building.disabledUntil !== undefined && building.disabledUntil >= at)
  ) {
    return null;
  }

  return building;
}

/**
 * **Ce que le relevé de ce joueur-là porte dans cette région** (ADR 0024 §4). La même question que
 * la rose pose à `view.surveyedInstallations`, posée ici sur la table qui la sert — et tranchée
 * par la même fonction pure des deux côtés du fil (`carriesSurveyedInstallation`).
 */
async function surveyedIn(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  regionId: string | null,
): Promise<boolean> {
  if (regionId === null) return false;
  const survey = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayerRegion', (q) => q.eq('playerId', playerId).eq('regionId', regionId))
    .unique();
  /** Le relevé range ses installations sous la région de sa ligne ; la vue les sert à plat, une
   *  par région. C'est la même liste des deux côtés, à la forme près. */
  return carriesSurveyedInstallation(
    regionId,
    (survey?.installations ?? []).map(() => ({ regionId })),
  );
}

/** Ce qu'un ordre peut nommer sur le fil. Le camp n'est pas une cible **stockée** : il se résout
 *  en sa position, et c'est cette position que le document garde (ADR 0024 §4). */
export type AimTarget =
  | (Doc<'movements'>['target'] & { kind: 'region' | 'outpost' | 'point' | 'building' })
  | { readonly kind: 'camp'; readonly campId: Id<'campSightings'> }
  | { readonly kind: 'objective'; readonly objectiveId: Id<'objectives'> }
  | { readonly kind: 'strategic'; readonly pointId: Id<'strategicPoints'> }
  | { readonly kind: 'track'; readonly movementId: Id<'movements'> };

const seasonIdOf = async (ctx: QueryCtx, playerId: Id<'players'>): Promise<Id<'seasons'> | null> =>
  (await ctx.db.get(playerId))?.seasonId ?? null;

export async function aimOf(
  ctx: QueryCtx,
  /** Read for one target only: a building is aimed at by its owner and by nobody else. */
  playerId: Id<'players'>,
  target: AimTarget,
): Promise<Aimed> {
  /** **A point is kept as it was aimed** (ADR 0019 §1): nothing looks up what stands there. Only
   *  the country is read off it, because the rest window is owed to whoever owns the ground. */
  if (target.kind === 'point') {
    /** La carte ne tend que des points qu'elle porte (`lonLatAt` borne les deux axes) ; un
     *  client qui écrit le sien posait une colonne aérienne hors du monde, telle quelle. */
    const { lon, lat } = target.point;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)
      fail('POINT_OFF_MAP');
    const point = pointOf(target.point);
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'point',
        lon: point[0],
        lat: point[1],
        coastal: coastAtPoint(point),
        onLand: landAtPoint(point),
        surveyed: await surveyedIn(ctx, playerId, regionAtRoutePoint(point)),
      },
      target: { kind: 'point', point: target.point },
      point,
      name: regionNameAt(point) ?? country,
      host: country,
    };
  }
  /**
   * **Un camp relevé se résout en sa position, et rien d'autre** (ADR 0024 §4). C'est le relevé
   * du joueur qui répond — jamais la pile vraie : elle peut avoir levé le camp, et c'est le
   * sujet. Le relevé d'un autre joueur n'existe pas pour celui-ci, et un camp qu'on n'a pas
   * relevé se refuse du mot d'un point vide.
   */
  if (target.kind === 'camp') {
    const camp = await ctx.db.get(target.campId);
    if (camp === null || camp.playerId !== playerId) fail('NOTHING_TO_ATTACK');
    const point = pointOf(camp.point);
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'camp',
        campId: camp._id,
        lon: point[0],
        lat: point[1],
        hostCountry: country,
        /** La même grille que la visée a lue, et la même que le départ lira : un camp mouillé
         *  en mer se vise par la mer (18/09). Le `medium` de la ligne dit déjà le premier, il
         *  ne dit pas la côte — une seule géométrie répond aux deux. */
        onLand: landAtPoint(point),
        coastal: coastAtPoint(point),
      },
      target: { kind: 'point', point: camp.point },
      point,
      name: regionNameAt(point) ?? country,
      host: country,
    };
  }
  /** **Un fil adverse en vue** (Blitz, B18) : sa position à l'instant, telle que le relevé la
   *  donne ; le refus d'un fil hors Blitz est celui de `refusalOf`, pas d'ici. */
  if (target.kind === 'track') {
    const { point } = await quarryOf(ctx, playerId, target, Date.now());
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'track',
        movementId: target.movementId,
        lon: point[0],
        lat: point[1],
        hostCountry: country,
        onLand: landAtPoint(point),
        coastal: coastAtPoint(point),
      },
      target: { kind: 'point', point: asPoint(point) },
      point,
      name: regionNameAt(point) ?? country,
      host: country,
    };
  }
  /**
   * **Un objectif neutre se résout en sa position, et il n'y a rien à relever** (exception de
   * l'ADR 0024 §4). C'est la vérité du plateau qui répond ici, et c'est légitime : l'objectif est
   * public — annoncé à tous au lancement, servi à tous par `playerView.objectives` — donc le lire
   * ne perce aucun brouillard. Ce que le brouillard garde est la garnison, et elle n'est pas ici.
   *
   * Un objectif déjà vidé reste une cible : sa garnison peut tenir encore, et rien n'oblige une
   * colonne à venir pour le dépôt.
   */
  if (target.kind === 'objective') {
    const objective = await ctx.db.get(target.objectiveId);
    if (objective === null || objective.seasonId !== (await seasonIdOf(ctx, playerId))) {
      fail('UNKNOWN_OBJECTIVE');
    }
    const point = pointOf(objective.point);
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'objective',
        objectiveId: objective._id,
        lon: point[0],
        lat: point[1],
        hostCountry: country,
      },
      target: { kind: 'point', point: objective.point },
      point,
      name: regionNameAt(point) ?? country,
      host: country,
    };
  }
  /** **Un point stratégique se résout en sa position** : public, comme un objectif (P2). */
  if (target.kind === 'strategic') {
    const strategic = await ctx.db.get(target.pointId);
    if (strategic === null || strategic.seasonId !== (await seasonIdOf(ctx, playerId))) {
      fail('UNKNOWN_STRATEGIC_POINT');
    }
    const point = pointOf(strategic.point);
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'strategic',
        pointId: strategic._id,
        lon: point[0],
        lat: point[1],
        hostCountry: country,
      },
      target: { kind: 'point', point: strategic.point },
      point,
      name: regionNameAt(point) ?? country,
      host: country,
    };
  }
  if (target.kind === 'outpost') {
    const outpost = await ctx.db.get(target.outpostId);
    /** **Un point d'une autre saison n'existe pas dans celle-ci**, et il se refuse du mot d'un
     *  identifiant inconnu : un compte assis à deux tables tient les identifiants de l'une, et
     *  sans ce contrôle ses colonnes de l'autre venaient s'y battre et désactiver le point. */
    if (!outpost || outpost.seasonId !== (await seasonIdOf(ctx, playerId))) {
      fail('UNKNOWN_OUTPOST', { outpostId: target.outpostId });
    }
    const anchor = pointOf(outpost.point);
    return {
      aim: {
        kind: 'outpost',
        outpostId: outpost._id,
        hostCountry: outpost.hostCountry,
        coastal: coastAtPoint(anchor),
      },
      target: { kind: 'outpost', outpostId: outpost._id },
      point: anchor,
      name: outpost.hostCountry,
      host: outpost.hostCountry,
    };
  }
  /**
   * **One enters one's own buildings and nobody else's** (decision 64b). Somebody else's is
   * answered exactly as a building that does not exist — the same word the departure uses for
   * it — because saying « pas à vous » would confirm that something stands there (ADR 0005).
   * The point is the region's, the only coordinate a building has (`stanceOf`).
   */
  if (target.kind === 'building') {
    const building = await ctx.db.get(target.buildingId);
    if (!building || building.playerId !== playerId) fail('UNKNOWN_BUILDING');
    const region = regionFacts(building.regionId);
    const stand = pointOfBuilding(building);
    if (!region || stand === null) fail('UNKNOWN_REGION', { regionId: building.regionId });
    return {
      aim: { kind: 'building', buildingId: building._id, key: building.key },
      target: { kind: 'building', buildingId: building._id },
      point: stand,
      name: region.name,
      host: region.country,
    };
  }
  const region = regionFacts(target.regionId);
  if (!region) fail('UNKNOWN_REGION', { regionId: target.regionId });
  return {
    aim: {
      kind: 'region',
      regionId: region.id,
      country: region.country,
      lon: region.point[0],
      lat: region.point[1],
      surveyed: await surveyedIn(ctx, playerId, region.id),
    },
    target: { kind: 'region', regionId: region.id },
    point: region.point,
    name: region.name,
    host: region.country,
  };
}

/** A manifest names each troop once. The client never repeats one, but a repeat would put the
 *  same troop in the pass as many times, each a full-strength combatant, and multiply what the
 *  column carries away. */
export const namesATroopTwice = (troopIds: ReadonlyArray<Id<'troops'>>): boolean =>
  new Set(troopIds).size !== troopIds.length;

/** The troops of an order, silently skipping what does not answer — a preview reads them to know
 *  which medium to draw in, and a hover is not the place to raise an error. */
export async function troopsAmong(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troopIds: ReadonlyArray<Id<'troops'>>,
): Promise<Array<Doc<'troops'>>> {
  const troops: Array<Doc<'troops'>> = [];
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop && troop.playerId === playerId) troops.push(troop);
  }
  return troops;
}

export async function columnOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  departure: Departure,
): Promise<Column> {
  const buildings = await ctx.db
    .query('buildings')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  const theatre = await blitzTheatreOf(ctx, playerId);
  return {
    ...(theatre === null
      ? {}
      : {
          blitz: {
            theatre,
            reloading: troops.some((troop) => (troop.reloadUntil ?? 0) > Date.now()),
            occupiedBuildingIds: await occupiedBuildingIds(
              ctx,
              playerId,
              troops.map((troop) => troop._id),
            ),
          },
        }),
    roles: troops.map((troop) => troop.role),
    myRegionIds: new Set(buildings.map((building) => building.regionId)),
    myOutpostIds: new Set((await outpostsOf(ctx, playerId)).map((outpost) => String(outpost._id))),
    departureBuildings: new Set([
      ...buildings
        .filter((building) => building.regionId === departure.regionId)
        .map((building) => building.key),
      ...(departure.airStop === true ? [PROJECTION_BY_DOMAIN.air] : []),
    ]),
    afloat: departure.afloat,
    coastal: departure.coastal,
    ...(theatre === null && outOfRounds(troops) ? { outOfRounds: true } : {}),
  };
}

/** Same shape and reason as `capReliefOf`: "montez le QG" is advice, "un quartier général niveau
 *  3 les porte à 4" is a plan. Both numbers come out of `movementSlots`, never recopied. */
const slotRelief = (hqLevel: number) =>
  hqLevel >= MAX_HQ_LEVEL
    ? {}
    : { nextHqLevel: hqLevel + 1, nextSlots: movementSlots(hqLevel + 1) };

/**
 * ADR 0006, carried by the headquarters since ADR 0015 dissolved the logistics centre. The count
 * comes from `movementSlots`, the very function `view.ts` fills the banner from — a placeholder
 * constant once capped this door at one while the banner promised `1 + hqLevel`. **A return does
 * not count**: holding a slot hostage while a beaten column walks back punishes one defeat twice.
 */
/** **On monte dans le transport qui tient le bâtiment** (15/10) : en Blitz, un bâtiment n'abrite
 *  qu'une unité, et celle qu'on rejoint pour embarquer ne ferme pas la porte. */
function boardingInto(column: Column, aim: MovementAim, boardsOn: unknown): Column {
  if (boardsOn === undefined || column.blitz === undefined || aim.kind !== 'building')
    return column;
  const occupied = new Set(column.blitz.occupiedBuildingIds);
  occupied.delete(aim.buildingId);
  return { ...column, blitz: { ...column.blitz, occupiedBuildingIds: occupied } };
}

/**
 * **Les slots tenus** : chaque mouvement, sauf un retour — et, au teneur de **Halifax**, sauf un
 * mouvement maritime (P11) —, plus chaque **tournée à l'arrêt** au chargement : elle garde son
 * slot tant qu'elle tourne (ADR 0028). Le même compte pour la porte (`claimSlot`) et pour la
 * bannière de la vue : une règle, une fonction.
 */
export async function slotsTaken(
  ctx: QueryCtx,
  player: Doc<'players'>,
  movements: ReadonlyArray<Doc<'movements'>>,
): Promise<number> {
  const flying = movements.filter((movement) => movement.type !== 'return');
  const marching = new Set(movements.flatMap((movement) => movement.troopIds));
  const resting = (
    await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect()
  ).filter((troop) => troop.tour !== undefined && !marching.has(troop._id)).length;
  if (!(await holdsHalifax(ctx, player))) return flying.length + resting;
  let kept = 0;
  for (const movement of flying) {
    if (!isMaritime(await crewOf(ctx, movement.troopIds))) kept += 1;
  }
  return kept + resting;
}

const holdsHalifax = async (ctx: QueryCtx, player: Doc<'players'>) =>
  (await seasonPoints(ctx, player.seasonId)).some(
    (point) => point.key === 'halifax' && point.holderId === player._id,
  );

async function crewOf(ctx: QueryCtx, troopIds: ReadonlyArray<Id<'troops'>>) {
  const crew = [];
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop !== null) crew.push({ role: troop.role, carried: troop.carriedBy !== undefined });
  }
  return crew;
}

export async function claimSlot(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  troopIds: ReadonlyArray<Id<'troops'>>,
): Promise<void> {
  /** **Pas de slots en Blitz** (B5) : la cadence est le rechargement, pas le QG. */
  if ((await blitzTheatreOf(ctx, playerId)) !== null) return;
  const player = await ctx.db.get(playerId);
  if (player === null) return;
  if ((await holdsHalifax(ctx, player)) && isMaritime(await crewOf(ctx, troopIds))) return;
  const hqLevel = await buildingLevel(ctx, playerId, 'hq');
  const maximum = movementSlots(hqLevel);
  if ((await slotsTaken(ctx, player, await movementsOf(ctx, playerId))) >= maximum) {
    fail('MOVEMENT_IN_FLIGHT', { maximum, hqLevel, ...slotRelief(hqLevel) });
  }
}

/**
 * **Ce que la route coûte en plein, et qui la paie** : les moteurs qui partent par eux-mêmes —
 * un passager ne consomme pas, son transport le porte. La mutation et l'aperçu lisent la même.
 */
export function fuelBill(
  troops: ReadonlyArray<Doc<'troops'>>,
  distanceUnits: number,
  blitz: boolean,
) {
  const column = troops.map(seatedOf);
  const seated = seatLoose(column);
  /** À bord, c'est le transport de la colonne qui le porte — un `carriedBy` resté d'un
   *  transport parti ailleurs ne fait rouler personne gratis (`carrierIn`). */
  const drivers = blitz
    ? []
    : troops.filter(
        (troop) =>
          fullSupplies(troop.role).fuel > 0 &&
          carrierIn(seatedOf(troop), column) === null &&
          !seated.has(troop._id),
      );
  const km = Math.round(distanceUnits * KM_PER_UNIT);
  return {
    drivers,
    km,
    steps: drivers.length === 0 ? 0 : fuelStepsFor(km),
    short: fuelRefusalOf(drivers, km),
  };
}

export async function march(
  ctx: MutationCtx,
  {
    playerId,
    season,
    type,
    origin,
    troopIds,
    aim,
    plunder,
    capture,
    pursuit,
    boardsOn,
    delivery,
    keepsSlot = false,
  }: {
    playerId: Id<'players'>;
    /** Read for its id alone: a movement is filed under the season it flies in. */
    season: Doc<'seasons'>;
    type: 'march' | 'attack' | 'raid';
    origin: MarchOrigin;
    troopIds: ReadonlyArray<Id<'troops'>>;
    aim: Aimed;
    plunder?: {
      readonly buildingId: Id<'buildings'>;
      readonly surveyed: { readonly key: Doc<'buildings'>['key']; readonly regionId: string };
    };
    capture?: NonNullable<Doc<'movements'>['capture']>;
    /** **La troupe poursuivie** (Blitz, B18) : la colonne n'a alors pas d'arrivée, elle a des
     *  regards (`schedulePursuit`). */
    pursuit?: { readonly troopId: Id<'troops'> };
    /** **Le transport où elle monte en arrivant** (15/10). */
    boardsOn?: Id<'troops'> | undefined;
    /** **Une livraison** (ADR 0028 §4) : les transports déchargent à l'arrivée et rentrent. */
    delivery?: NonNullable<Doc<'movements'>['delivery']>;
    /** **Le pas suivant d'une tournée**, qui garde le slot qu'elle a pris (ADR 0028). */
    // used by the supply round (4.7 B)
    keepsSlot?: boolean;
  },
) {
  if (namesATroopTwice(troopIds)) fail('DUPLICATE_TROOP');
  if (!keepsSlot) await claimSlot(ctx, playerId, troopIds);

  /** **Where the column stands, and nothing more** (ADR 0019 §1): the origin only has to be the
   *  address the troops hang from, so a garrison abroad is not ordered out of a barracks. */
  const departure = await departureOf(ctx, playerId, origin);
  if (departure === null) {
    if (origin.kind === 'outpost') fail('UNKNOWN_OUTPOST', { outpostId: origin.outpostId });
    fail('UNKNOWN_BUILDING');
  }

  const troops: Array<Doc<'troops'>> = [];
  const marching = new Set(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (!troop || troop.playerId !== playerId) fail('UNKNOWN_TROOP', { troopId });
    if (!sameStation(troop.stationedAt, departure.stationId) || marching.has(troopId)) {
      fail('TROOP_NOT_AT_ORIGIN', { troopId });
    }
    troops.push(troop);
  }
  /** **Les passagers suivent leur transport** (15/10) : un transport part avec sa cargaison, et
   *  un passager ne part pas sans lui — on le débarque d'abord. */
  const pile = (await standingPile(ctx, playerId, departure.stationId)).map(seatedOf);
  for (const troop of [...troops]) {
    const carrier = carrierIn(seatedOf(troop), pile);
    if (carrier !== null && !troops.some((one) => one._id === carrier.id))
      fail('STILL_ABOARD', { troopId: troop._id });
    for (const rider of cargoOf(seatedOf(troop), pile))
      if (!troops.some((one) => one._id === rider.id))
        troops.push((await ctx.db.get(rider.id as Id<'troops'>))!);
  }

  /** **Ancrée, elle se recharge au départ** (ADR 0028 §3) : les coups et le plein se reprennent
   *  sur le plateau personnel avant que l'ordre ne les lise. */
  const supplied = await resupply(ctx, playerId, troops, Date.now());
  troops.splice(0, troops.length, ...supplied);

  /** **The refusal comes before the route**: nothing in it reads a trip any more (design sheet
   *  09), so an order the fan should never have offered costs nothing — the whole of ADR 0015. */
  const column = boardingInto(await columnOf(ctx, playerId, troops, departure), aim.aim, boardsOn);
  const refusal =
    capture !== undefined
      ? captureOrderRefusalOf(aim.aim, column, false)
      : plunder === undefined
        ? refusalOf(type, aim.aim, column)
        : plunderOrderRefusalOf(
            aim.aim as Extract<MovementAim, { kind: 'building' }>,
            column,
            false,
          );
  if (refusal !== null) fail(refusal, { type, ...refusalDetails(aim.aim, column) });
  /** **Le cadre vaut pour toute visée** (B1) : un mât ou un point d'appui n'a pas de coordonnées
   *  dans sa visée, mais il en a sur le plateau. */
  if (column.blitz !== undefined && !withinTheatre(column.blitz.theatre, aim.point))
    fail('OUTSIDE_THEATRE', { type });

  const route = routeBetween(
    departure.point,
    aim.point,
    routeModeOf(column.roles),
    landCostOf(column.roles),
  );
  if (route === null) fail('NO_LAND_ROUTE', { from: departure.name, to: aim.name });

  /**
   * **Le plein se paie au départ** (ADR 0028 §3) : chaque moteur qui roule, vogue ou vole débite
   * sa route, et une route plus longue que le plus petit plein est refusée. Un passager ne
   * consomme pas : son transport le porte.
   */
  const fuel = fuelBill(troops, route.distanceUnits, column.blitz !== undefined);
  if (fuel.short !== null) fail('NOT_ENOUGH_FUEL', { ...fuel.short, km: fuel.km });
  for (const troop of fuel.drivers)
    await ctx.db.patch(troop._id, { fuel: suppliesOf(troop).fuel - fuel.steps });

  const now = Date.now();
  const minutes = await pacedMinutes(ctx, playerId, route, now);
  const arrivesAt = now + minutes * 60_000;
  const cargo = await takeStationedCargo(ctx, {
    seasonId: season._id,
    playerId,
    stationedAt: departure.stationId,
    troops,
  });
  const movementId = await ctx.db.insert('movements', {
    seasonId: season._id,
    playerId,
    type,
    fromBuildingId: departure.fromBuildingId,
    target: aim.target,
    from: asPoint(departure.point),
    to: asPoint(aim.point),
    hostCountry: aim.host,
    points: route.points.map(asPoint),
    legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
    distanceUnits: route.distanceUnits,
    costUnits: route.costUnits,
    landCost: route.landCost,
    troopIds: troops.map((troop) => troop._id),
    departedAt: now,
    arrivesAt,
    ...(plunder === undefined
      ? {}
      : {
          plunder: {
            phase: 'outbound' as const,
            buildingId: plunder.buildingId,
            surveyed: plunder.surveyed,
          },
        }),
    /** **Pourquoi elle y va**, puisque la cible stockée n'est qu'un point : sans cette marque,
     *  une attaque qui passe par là emporterait un dépôt que personne n'est venu chercher. */
    ...(aim.aim.kind === 'objective'
      ? { objectiveId: aim.aim.objectiveId as Id<'objectives'> }
      : {}),
    ...(capture === undefined ? {} : { capture }),
    ...(pursuit === undefined ? {} : { pursuit: { troopId: pursuit.troopId, checkAt: now } }),
    ...(boardsOn === undefined ? {} : { boardsOn }),
    ...(delivery === undefined ? {} : { delivery }),
    ...movementCargoFields(cargo),
  });
  /** **Une colonne mixte embarque au départ** (15/10) : ce qui part à pied avec un transport monte
   *  s'il y a de la place, et le reste à bord à l'arrivée. */
  for (const [riderId, carrierId] of seatLoose(troops.map(seatedOf)))
    await ctx.db.patch(riderId as Id<'troops'>, { carriedBy: carrierId as Id<'troops'> });
  /** The document rather than its parts: the sweep has to read the order exactly as the arrival
   *  will, and the surest way to say that is to hand it the same row. */
  const filed = (await ctx.db.get(movementId))!;
  if (pursuit === undefined)
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  else await schedulePursuit(ctx, filed, now);
  /** **Une garnison qui part entière emporte le chantier** (révision du 15/09) : un point en
   *  cours de fondation n'est qu'une promesse tenue par la colonne qui la garde. Rien n'est
   *  remboursé, et le point disparaît avant que le brouillard soit réévalué. */
  if (origin.kind === 'outpost') await collapseIfAbandoned(ctx, origin.outpostId, now);
  await reassessDetection(ctx, filed.seasonId, now);
  /** **Le départ est un point d'échantillonnage** (ADR 0020 §5), et le seul du trajet qui tombe
   *  maintenant : le couloir se relève à l'arrivée, quand il aura été marché. */
  await surveyFromPoint(ctx, playerId, departure.point, now, column.roles);
  return { movementId, minutes, arrivesAt };
}
