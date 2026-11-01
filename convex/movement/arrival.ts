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
import { carryCapacityOf, trimLootToCapacity } from '../../src/domain/loot';
import { landCostOf, routeModeOf } from '../../src/domain/movement-orders';
import { isNation } from '../../src/domain/nations';
import { RESOURCES } from '../../src/domain/ids';
import { nearestOutpost } from '../../src/domain/outposts';
import { firesIndirect } from '../../src/domain/indirect-fire';
import { arrivalFacing } from '../../src/domain/pile-facing';
import {
  cargoTotal,
  movementCargoFields,
  recordCargoDelivery,
  splitCargoLoads,
  stationCargoLoads,
  stationMovementLoot,
  takeMovementCargo,
  type HomewardCargo,
} from '../cargo';
import { resolveContact } from '../combat';
import { collapseIfAbandoned } from '../outposts';
import { seenSegment } from '../../src/domain/sighting-segment';
import { marchingForce, reassessDetection } from './detection';
import {
  CARRY_CAPACITY_BY_ROLE,
  OUTPOST_DISABLED_HOURS,
  OUTPOST_IMMUNITY_HOURS,
} from '../constants';
import { reportChange, scheduleRestore, settleBeforeChange } from '../production';
import { regionAtPoint } from '../regionGeometry';
import { capitalRegionOf, pointOfBuilding, regionFacts } from '../regions';
import { hostAtPoint, routeBetween } from '../routes';
import {
  asPoint,
  defenceOf,
  onAirfield,
  outpostsOf,
  pointOf,
  seatedOf,
  standingPile,
  troopsCarriedBy,
  type TroopAddress,
} from './forces';
import { boardingRefusalOf } from '../../src/domain/movement-orders';
import { carrierIn, PROJECTION_BY_DOMAIN } from '../../src/domain/troops';
import { surveyFromPoint } from '../surveys';
import { seatsOf } from '../seats';
import { notifyPlayer } from '../notifications';
import { journalUrl, push } from '../../src/domain/push';
import { pacedMinutes } from './pace';
import { creditToStorage, settle } from '../resources';
import { planCargoReturn, startCargoReturn } from './cargoReturn';

/**
 * **Ce que la colonne laisse derrière elle** (ADR 0024 §2). Le mouvement disparaît en trois
 * endroits, et tous les trois passent par ici.
 *
 * Une fenêtre **déjà ouverte** ne s'efface pas avec lui : elle se fige en dernière position
 * connue — le tronçon vu jusqu'à maintenant, calculé une dernière fois pendant que la route est
 * encore lisible. Elle s'effaçait avec le mouvement, et un joueur voyait l'arc s'évaporer à
 * l'instant où la colonne rentrait : le brouillard rend l'information périmée, pas inexistante.
 *
 * Une fenêtre **à venir**, elle, part bien : elle n'a rien montré, et rien ne se souvient de ce
 * qu'on n'a pas vu.
 */
export async function forgetMovement(
  ctx: MutationCtx,
  movementId: Id<'movements'>,
  now = Date.now(),
): Promise<void> {
  const movement = await ctx.db.get(movementId);
  const seen = await ctx.db
    .query('sightings')
    .withIndex('byMovement', (q) => q.eq('movementId', movementId))
    .collect();
  for (const sighting of seen) {
    if (sighting.from > now || movement === null) {
      if (sighting.revealJobId !== undefined) {
        try {
          await ctx.scheduler.cancel(sighting.revealJobId);
        } catch {
          // A running reveal validates that its row still exists.
        }
      }
      await ctx.db.delete(sighting._id);
      continue;
    }
    const closedAt = Math.min(sighting.to, now);
    const segment = seenSegment(marchingForce(movement), sighting.from, closedAt);
    await ctx.db.patch(sighting._id, {
      to: closedAt,
      frozen: {
        points: segment.points.map(asPoint),
        legs: [...segment.legs],
        distanceUnits: segment.distanceUnits,
        costUnits: segment.costUnits,
        headingDegrees: segment.headingDegrees,
        closedAt,
      },
    });
  }
  if (movement !== null) await settleBatteries(ctx, movement.troopIds, now);
  await ctx.db.delete(movementId);
}

/** **Une pièce se met en batterie à l'arrêt** (B20) : la fin du mouvement qui la portait date
 *  son immobilité, quelle que soit la façon dont il s'achève. */
async function settleBatteries(
  ctx: MutationCtx,
  troopIds: ReadonlyArray<Id<'troops'>>,
  now: number,
): Promise<void> {
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop !== null && firesIndirect(troop.role))
      await ctx.db.patch(troopId, { settledAt: now });
  }
}

async function homewardCargoOf(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<ReadonlyArray<HomewardCargo>> {
  const current = await ctx.db.get(movement._id);
  if (current === null) return [];
  const loads = await takeMovementCargo(ctx, current);
  return loads.length === 0
    ? []
    : [{ playerId: current.playerId, troopIds: current.troopIds, loads }];
}

/**
 * **Ce que la colonne a sous les yeux en ne trouvant personne** (retours du 11/09, ligne 5). Une
 * attaque vise un point ou une pile, jamais un bâtiment : arrivée sur une région adverse sans
 * garnison, elle est bredouille — et en prod le joueur qui venait saboter une mine a relu « n'a
 * trouvé personne », sans rien qui dise que la mine était là ni par où on l'atteint.
 *
 * Rien de neuf ne sort du serveur : c'est **le propre relevé du joueur** qui répond, celui que le
 * couloir vient d'écrire à l'arrivée. Sans relevé, pas de phrase — la dépêche ne révèle pas un
 * bâtiment que le brouillard n'a pas servi.
 *
 * La région est celle du polygone sous le point d'arrivée, et le repli est la région visée : un
 * mât adverse se relève par région, et c'est la seule clé que le relevé porte.
 */
const surveyedInstallationAt = async (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<Doc<'buildings'>['key'] | undefined> => {
  const regionId =
    regionAtPoint(pointOf(movement.to))?.id ??
    (movement.target.kind === 'region' ? movement.target.regionId : null);
  if (regionId === null) return undefined;
  const surveyed = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayerRegion', (q) =>
      q.eq('playerId', movement.playerId).eq('regionId', regionId),
    )
    .unique();
  /** Une seule est nommée quand la région en porte plusieurs : la dépêche envoie au mât, et
   *  c'est la carte qui tient l'inventaire. */
  return (surveyed?.installations ?? [])[0]?.key;
};

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
    /** **Une réserve que plus personne ne garde revient à qui s'y présente** — comme un
     *  avant-poste sans garnison tombe sur celui qui marche jusqu'à lui. Le premier l'a réduite,
     *  le suivant emporte ce qu'elle n'a pas pu porter : c'est la règle du reste laissé au sol. */
    const carried = await homewardCargoOf(ctx, movement);
    const spoils = await emptyObjective(ctx, movement, marching, carried, now);
    /** No pass, therefore no account, therefore nothing in the journal — a player came back to
     *  "rien à signaler" after the longest march of his season. **Sauf s'il ramène quelque
     *  chose** : les dépêches du butin racontent alors le voyage, et « n'a trouvé personne »
     *  les contredirait. */
    const installation = await surveyedInstallationAt(ctx, movement);
    if (spoils.length === 0) {
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'columnFoundNothing',
        movementType: type,
        hostCountry: movement.hostCountry,
        point: movement.to,
        troops: marching.length,
        ...(installation === undefined ? {} : { installation }),
      });
    }
    await walkHome(ctx, { winners: marching, beaten: [] }, pointOf(movement.to), now, [
      ...carried,
      ...spoils,
    ]);
    return;
  }

  const { engagementId, engagement, routed, routedCargo } = await resolveContact(ctx, {
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
  await retainStandingDefence(ctx, defence.movementId, engagement);

  if (type === 'raid' && outpost !== null && engagement.winner === 'attacker') {
    await deactivate(ctx, outpost, now, engagementId);
  }
  /**
   * **Un chantier détruit avec sa garnison disparaît** (révision du 15/09) : tant que le point
   * n'est pas levé, il n'est que la promesse que cette colonne-là tient. On l'attaque comme une
   * force posée — pas d'immunité, pas de désactivation à lui faire subir : il n'y a rien à
   * désactiver. Rien n'est remboursé.
   */
  if (defence.outpostId !== null) await collapseIfAbandoned(ctx, defence.outpostId, now);

  /** Whoever is still on his feet walks back, routed or not: the column came to fight, not to
   *  stay (ADR 0019 §3 for the other side). */
  const survivors = marching.filter((troop) =>
    engagement.outcomes.some(
      (outcome) => outcome.id === troop._id && outcome.state !== 'destroyed',
    ),
  );
  const carried = await homewardCargoOf(ctx, movement);
  const spoils =
    engagement.winner === 'attacker'
      ? await emptyObjective(ctx, movement, survivors, carried, now)
      : [];
  const cargo = [...carried, ...spoils, ...routedCargo];
  await walkHome(ctx, { winners: survivors, beaten: routed }, pointOf(movement.to), now, cargo);
}

/**
 * **Le dépôt de l'objectif, pris par qui vient de réduire sa garnison** — borné par ce que la
 * colonne peut porter, et **le reste reste au sol** : c'est la phrase de la règle, et c'est ce
 * qui fait qu'une réserve trop grosse pour un seul attire le suivant plutôt que de le priver.
 *
 * Ce qui part de là est une charge ordinaire : le retour chargé, sa livraison à la frontière et
 * ses dépêches sont la mécanique du pillage (`convex/cargo.ts`), sans une ligne de plus.
 *
 * `objectiveId` sur le mouvement est ce qui ouvre la porte, et pas la position : une attaque qui
 * passe au même endroit n'emporte pas un dépôt que personne n'est venu chercher.
 */
async function emptyObjective(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  survivors: ReadonlyArray<Doc<'troops'>>,
  carried: ReadonlyArray<HomewardCargo>,
  now: number,
): Promise<ReadonlyArray<HomewardCargo>> {
  const objectiveId = movement.objectiveId;
  if (objectiveId === undefined || survivors.length === 0) return [];
  const objective = await ctx.db.get(objectiveId);
  if (objective === null || objective.seasonId !== movement.seasonId) return [];

  const held = cargoTotal(carried.flatMap((load) => load.loads));
  const free =
    carryCapacityOf(
      survivors.map((troop) => ({
        role: troop.role,
        strength: troop.currentStrength,
        nominalStrength: troop.nominalStrength,
      })),
      CARRY_CAPACITY_BY_ROLE,
    ) - RESOURCES.reduce((sum, key) => sum + held[key], 0);
  const taken = trimLootToCapacity(objective.depot, free);
  if (!RESOURCES.some((key) => taken[key] > 0)) return [];

  const left = { ...objective.depot };
  for (const key of RESOURCES) left[key] = Math.max(0, left[key] - taken[key]);
  const emptied = !RESOURCES.some((key) => left[key] > 0);
  await ctx.db.patch(objectiveId, {
    depot: left,
    ...(emptied ? { status: 'taken' as const, takenAt: now } : {}),
  });
  /** **Le dépôt est vide, et personne n'est nommé** : qui l'a emporté est une information de
   *  position, que le brouillard garde (ADR 0005). Le preneur, lui, lit ses dépêches de butin. */
  if (emptied) await announceTaken(ctx, objective, now);

  return [
    {
      playerId: movement.playerId,
      troopIds: survivors.map((troop) => troop._id),
      loads: [{ loot: taken }],
    },
  ];
}

async function announceTaken(
  ctx: MutationCtx,
  objective: Doc<'objectives'>,
  now: number,
): Promise<void> {
  for (const seat of await seatsOf(ctx, objective.seasonId)) {
    await ctx.db.insert('notices', {
      playerId: seat._id,
      at: now,
      kind: 'objectiveTaken',
      objective: objective.key,
      hostCountry: regionFacts(objective.regionId)?.country ?? '',
      regionId: objective.regionId,
    });
  }
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

/**
 * **Le point qu'une marche venait rejoindre**, `null` quand ce n'était pas le sien — ou qu'il
 * n'est plus là. Jumelle de `garrisonOf` sur l'autre sorte d'adresse (décision du 16/09) : une
 * colonne qui marche sur son propre avant-poste y devient garnison, exactement comme celle qui
 * entre dans un mât. Démantelé ou perdu pendant le trajet, elle se pose au point atteint plutôt
 * que de pendre à rien (règle 3, ADR 0019 §1).
 */
export async function outpostGarrisonOf(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<Doc<'outposts'> | null> {
  if (movement.target.kind !== 'outpost') return null;
  const outpost = await ctx.db.get(movement.target.outpostId);
  return outpost !== null && outpost.playerId === movement.playerId ? outpost : null;
}

/**
 * **La colonne s'arrête où elle arrive, et il ne se passe rien** (ADR 0024 §3, révision de l'ADR
 * 0019 §3). Elle ne cherche plus de défense : une marche peut désormais s'arrêter à côté d'un camp
 * adverse, chez lui, dans le rayon de son avant-poste, sur la région de sa mine — tant que
 * personne n'attaque, il ne se passe rien.
 *
 * Ce que ça retire est l'**embuscade automatique**, et ce qu'elle donnait — punir une marche
 * imprudente — revient à la main du joueur qui la voit passer : son camp est relevé (§1), et
 * l'attaque est un ordre qu'il donne.
 *
 * `address` is what the standing troops take — the point reached, or the building they came to
 * garrison (decision 64b). It answers how many took it, so the journal can tell a garrison
 * entered from a column that fought its way to a point and lost everything on it.
 */
export async function standAt(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  address: TroopAddress = movement.to,
): Promise<number> {
  const owner = await ctx.db.get(movement.playerId);
  const marching = await troopsCarriedBy(ctx, movement);
  if (!owner || marching.length === 0) return 0;

  /** What the troops ate until now, they ate where they stood: settle before the address
   *  changes the upkeep, or the new rate is charged backwards over the whole march. */
  await settle(ctx, movement.playerId, Date.now());
  const facing =
    address !== null && typeof address !== 'string'
      ? arrivalFacing(
          movement.points.map(pointOf),
          await standingPile(ctx, movement.playerId, address),
          // Stopped on the way (a pursuit): the way it was going there, not at its route's end.
          address.lon === movement.to.lon && address.lat === movement.to.lat
            ? undefined
            : pointOf(address),
        )
      : undefined;
  for (const troop of marching) await ctx.db.patch(troop._id, { stationedAt: address, facing });
  await stationMovementLoot(ctx, movement, address);
  if (movement.boardsOn !== undefined)
    await boardOnArrival(ctx, movement.boardsOn, marching, address);
  return marching.length;
}

/** **Lâchée de loin sur un transport** (15/10), la colonne monte à bord en arrivant — s'il se
 *  tient encore là et qu'il a la place, sans quoi elle reste à pied où elle est arrivée. */
async function boardOnArrival(
  ctx: MutationCtx,
  carrierId: Id<'troops'>,
  arrived: ReadonlyArray<Doc<'troops'>>,
  address: TroopAddress,
): Promise<void> {
  const carrier = await ctx.db.get(carrierId);
  if (carrier === null) return;
  const standing = await standingPile(ctx, carrier.playerId, address);
  if (!standing.some((troop) => troop._id === carrierId)) return;
  const column = arrived.map(seatedOf);
  const boarding = {
    riders: column.filter((troop) => carrierIn(troop, column) === null),
    carrier: seatedOf(carrier),
    pile: [...standing.map(seatedOf), ...column],
    atAirfield: await onAirfield(ctx, address),
  };
  if (boardingRefusalOf(boarding) !== null) return;
  for (const rider of boarding.riders)
    await ctx.db.patch(rider.id as Id<'troops'>, { carriedBy: carrierId });
}

async function retainStandingDefence(
  ctx: MutationCtx,
  movementId: Id<'movements'> | null,
  engagement: Awaited<ReturnType<typeof resolveContact>>['engagement'],
): Promise<void> {
  if (movementId === null) return;
  const movement = await ctx.db.get(movementId);
  if (movement === null) return;
  const standing = new Set(
    engagement.outcomes
      .filter((outcome) => outcome.state === 'standing')
      .map((outcome) => outcome.id),
  );
  const troopIds = movement.troopIds.filter((troopId) => standing.has(troopId));
  if (troopIds.length === 0) await forgetMovement(ctx, movementId);
  else await ctx.db.patch(movementId, { troopIds });
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

  /**
   * **Les stocks se règlent avant que la couleur change** (ADR 0020 §6, §7). Le point cesse de
   * colorer sa zone à cet instant, donc tout ce qui y produit cesse de produire à cet
   * instant — et pas rétroactivement sur les heures qu'il a bien tenues. C'est ce qui donne au
   * raid sa valeur économique indépendante du butin.
   */
  const before = await settleBeforeChange(ctx, outpost.seasonId, now);

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
    point: outpost.point,
  });
  await notifyPlayer(ctx, outpost.playerId, {
    type: 'outpost',
    phrase: push.outpostDisabled,
    url: journalUrl,
    at: now,
  });
  await reportChange(ctx, outpost.seasonId, before, now);
  /** **La vigie s'éteint avec le point** (invariant Brouillard) : la réévaluation se fait ici, pas
   *  à la suivante. Seuls les détecteurs de son propriétaire changent. */
  await reassessDetection(ctx, outpost.seasonId, now, outpost.playerId);
  /** La couleur reviendra seule : le rendez-vous se prend ici, à la seconde où le raid l'a fixé.
   *  Personne n'ordonne cet événement-là, et rien ne bat pour le constater. */
  await scheduleRestore(ctx, outpost.seasonId, disabledUntil);
}

/** A building razed while its troops were away leaves them standing where they arrived rather
 *  than hanging from nothing (rule 3, ADR 0019 §1). */
export async function attachHome(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<TroopAddress> {
  const home = await homeOf(ctx, movement);
  /** What the troops ate until now, they ate where they stood: settle before the address
   *  changes the upkeep, or the new rate is charged backwards over the whole march. */
  await settle(ctx, movement.playerId, Date.now());
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: home, facing: undefined });
  }
  return home;
}

async function homeOf(ctx: MutationCtx, movement: Doc<'movements'>): Promise<TroopAddress> {
  if (movement.fromBuildingId !== null) {
    const station = await ctx.db.get(movement.fromBuildingId);
    /** **Capturé entre-temps, il n'est plus à elle** (14/10) : la colonne se tient au seuil. */
    return station?.playerId === movement.playerId ? station._id : movement.to;
  }
  /** A rout refluxed to one of its own outposts becomes its garrison (ADR 0019 §3); razed since
   *  — the anchor is read once, at the rout — it stands on the ground it reached. */
  if (movement.target.kind === 'outpost') {
    const outpost = await ctx.db.get(movement.target.outpostId);
    return outpost?.playerId === movement.playerId ? outpost._id : movement.to;
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
  /** Home is a port: a hull moors where open water reaches it (`mooringOf`, #221). */
  readonly quay: boolean;
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
    /** Razed — or captured — while its column was away: it stays on the ground it fought on
     *  (ADR 0019 §1). */
    if (
      building === null ||
      building.playerId !== troop.playerId ||
      origin === null ||
      back === null
    )
      return { kind: 'stays', address: asPoint(from) };
    return {
      kind: 'walks',
      key: `building:${troop.playerId}:${building._id}`,
      point: back,
      hostCountry: origin.country,
      target: { kind: 'home' },
      fromBuildingId: building._id,
      stranded: asPoint(from),
      quay: building.key === PROJECTION_BY_DOMAIN.sea,
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
      quay: false,
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
      quay: false,
    };
  }

  const outpostId = ctx.db.normalizeId('outposts', address);
  const outpost = outpostId === null ? null : await ctx.db.get(outpostId);
  /** Razed or captured while its garrison was away: it stands on the ground it fought on. */
  if (outpost === null || outpost.playerId !== troop.playerId)
    return { kind: 'stays', address: asPoint(from) };
  return {
    kind: 'walks',
    key: `outpost:${troop.playerId}:${outpost._id}`,
    point: pointOf(outpost.point),
    hostCountry: outpost.hostCountry,
    target: { kind: 'outpost', outpostId: outpost._id },
    fromBuildingId: null,
    stranded: asPoint(from),
    quay: false,
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
  cargo: ReadonlyArray<HomewardCargo> = [],
): Promise<ReadonlyArray<Id<'movements'>>> {
  /** The rout wins the tie: an attacker that broke contact is named on both lists, and that was
   *  the last thing it did. A map keyed by the troop makes two roads at once impossible. */
  const homeward = new Map<Id<'troops'>, { troop: Doc<'troops'>; routed: boolean }>();
  for (const troop of winners) homeward.set(troop._id, { troop, routed: false });
  for (const troop of beaten) homeward.set(troop._id, { troop, routed: true });

  /** **Ce que chacun a vu du sol où il s'est battu** (ADR 0020 §5) : une passe de résolution
   *  laisse des troupes debout sur un point, et les deux camps en repartent en le sachant. Un
   *  relevé par joueur présent, pas un par troupe — c'est le même sol. */
  for (const playerId of new Set([...homeward.values()].map(({ troop }) => troop.playerId))) {
    const roles = [...homeward.values()]
      .map(({ troop }) => troop)
      .filter((troop) => troop.playerId === playerId)
      .map((troop) => troop.role);
    await surveyFromPoint(ctx, playerId, from, now, roles);
  }

  // Pas de plein débité ici (ADR 0028 §3) : ce retour n'est l'ordre de personne, et le payer
  // coincerait au loin une troupe qui n'a pas choisi d'y rester.
  const roads = new Map<string, { home: HomeRoad; group: Array<Doc<'troops'>> }>();
  const staying = new Map<string, { address: TroopAddress; group: Array<Doc<'troops'>> }>();
  const filed: Array<Id<'movements'>> = [];
  for (const { troop, routed } of homeward.values()) {
    const home = await homeFor(ctx, troop, routed, from);
    if (home === null) {
      const key = `home:${troop.playerId}`;
      const stay = staying.get(key) ?? { address: troop.stationedAt, group: [] };
      stay.group.push(troop);
      staying.set(key, stay);
      continue;
    }
    if (home.kind === 'stays') {
      await ctx.db.patch(troop._id, { stationedAt: home.address, facing: undefined });
      const address = home.address;
      const key =
        address === null
          ? `home:${troop.playerId}`
          : typeof address === 'string'
            ? `station:${troop.playerId}:${address}`
            : `point:${troop.playerId}:${address.lon},${address.lat}`;
      const stay = staying.get(key) ?? { address, group: [] };
      stay.group.push(troop);
      staying.set(key, stay);
      continue;
    }
    const road = roads.get(home.key) ?? { home, group: [] };
    road.group.push(troop);
    roads.set(home.key, road);
  }

  const groups = [
    ...[...staying.values()].map(({ group }) => group),
    ...[...roads.values()].map(({ group }) => group),
  ];
  const cargoByGroup = new Map<ReadonlyArray<Doc<'troops'>>, HomewardCargo>();
  for (const load of cargo) {
    const carrierIds = new Set(load.troopIds);
    const carryingGroups = groups.filter((group) =>
      group.some((troop) => carrierIds.has(troop._id)),
    );
    const capacities = await Promise.all(
      carryingGroups.map(async (group) => {
        const current = (await Promise.all(group.map((troop) => ctx.db.get(troop._id)))).filter(
          (troop): troop is Doc<'troops'> => troop !== null,
        );
        return carryCapacityOf(
          current.map((troop) => ({
            role: troop.role,
            strength: troop.currentStrength,
            nominalStrength: troop.nominalStrength,
          })),
          CARRY_CAPACITY_BY_ROLE,
        );
      }),
    );
    const distributed = splitCargoLoads(load.loads, capacities);
    carryingGroups.forEach((group, index) => {
      if (distributed[index]!.length > 0) {
        const previous = cargoByGroup.get(group);
        cargoByGroup.set(group, {
          ...load,
          troopIds: group.map((troop) => troop._id),
          loads: [...(previous?.loads ?? []), ...distributed[index]!],
        });
      }
    });
  }

  const cargoFor = (group: ReadonlyArray<Doc<'troops'>>): HomewardCargo | undefined =>
    cargoByGroup.get(group);

  const returnCargo = async (
    group: ReadonlyArray<Doc<'troops'>>,
    load: HomewardCargo,
  ): Promise<Id<'movements'> | null> => {
    const first = group[0];
    if (first === undefined || first.playerId !== load.playerId) return null;
    const plan = await planCargoReturn(ctx, {
      seasonId: first.seasonId,
      playerId: first.playerId,
      from,
      roles: group.map((troop) => troop.role),
      now,
    });
    if (plan === null) {
      const stationedAt = asPoint(from);
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt, facing: undefined });
      await stationCargoLoads(ctx, {
        seasonId: first.seasonId,
        playerId: first.playerId,
        troopIds: group.map((troop) => troop._id),
        stationedAt,
        loads: load.loads,
      });
      return null;
    }
    if (plan.kind === 'standing') {
      const stationedAt = asPoint(from);
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt, facing: undefined });
      const credited = await creditToStorage(ctx, first.playerId, cargoTotal(load.loads), now);
      await recordCargoDelivery(ctx, load.loads, credited.delivered, credited.lost, {
        playerId: first.playerId,
        regionId: plan.regionId,
        at: now,
      });
      return null;
    }
    return startCargoReturn(ctx, {
      seasonId: first.seasonId,
      playerId: first.playerId,
      from,
      troopIds: group.map((troop) => troop._id),
      plan,
      cargoFields: movementCargoFields(load.loads),
      now,
    });
  };

  const attachedCargo = new Set<HomewardCargo>();
  for (const { group } of staying.values()) {
    const load = cargoFor(group);
    if (load === undefined || attachedCargo.has(load) || group[0]?.playerId !== load.playerId)
      continue;
    const movementId = await returnCargo(group, load);
    if (movementId !== null) filed.push(movementId);
    attachedCargo.add(load);
  }

  for (const { home, group } of roads.values()) {
    const load = cargoFor(group);
    if (load !== undefined && !attachedCargo.has(load) && group[0]?.playerId === load.playerId) {
      const movementId = await returnCargo(group, load);
      if (movementId !== null) filed.push(movementId);
      attachedCargo.add(load);
      continue;
    }
    /** **Already standing on it**, and it never left — the address it has is the one it would
     *  come back to. */
    if (home.point[0] === from[0] && home.point[1] === from[1]) {
      if (load !== undefined && !attachedCargo.has(load) && group[0]?.playerId === load.playerId) {
        await stationCargoLoads(ctx, {
          seasonId: group[0].seasonId,
          playerId: load.playerId,
          troopIds: group.map((troop) => troop._id),
          stationedAt: group[0].stationedAt,
          loads: load.loads,
        });
        attachedCargo.add(load);
      }
      continue;
    }

    /** A column coming home from overseas has a sea to recross; `'land'` would find no route at
     *  all. A return is not an order, so it owes no port. */
    const roles = group.map((troop) => troop.role);
    const route = routeBetween(from, home.point, routeModeOf(roles), landCostOf(roles), home.quay);
    /** No road home — a landing whose transports sank, and nothing else. */
    if (route === null) {
      for (const troop of group)
        await ctx.db.patch(troop._id, { stationedAt: home.stranded, facing: undefined });
      if (load !== undefined && !attachedCargo.has(load) && group[0]?.playerId === load.playerId) {
        await stationCargoLoads(ctx, {
          seasonId: group[0].seasonId,
          playerId: load.playerId,
          troopIds: group.map((troop) => troop._id),
          stationedAt: home.stranded,
          loads: load.loads,
        });
        attachedCargo.add(load);
      }
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
      ...(load !== undefined && group[0]!.playerId === load.playerId && !attachedCargo.has(load)
        ? movementCargoFields(load.loads)
        : {}),
    });
    if (load !== undefined && group[0]!.playerId === load.playerId && !attachedCargo.has(load)) {
      attachedCargo.add(load);
    }
    /** Le plein de Bakou se recompte depuis l'arrivée du retour, comme depuis celle d'un départ. */
    for (const troop of group) await ctx.db.patch(troop._id, { fuelAt: arrivesAt });
    filed.push(movementId);
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  }
  return filed;
}
