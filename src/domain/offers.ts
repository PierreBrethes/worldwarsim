import { fr, raiseHoldText, specialtyRefusalText, upgradeHoldText } from '@/i18n/fr';
import { notInBlitz } from './blitz';
import type { CompassTarget } from './compass-rose';
import { foundingMotive } from './compass-works';
import {
  demolitionRefusalOf,
  foundationHold,
  outpostDismantleRefusalOf,
  outpostRaiseHold,
  pledgedOutposts,
  raiseChoosesSpecialty,
  specialtyRefusalOf,
  underCaptureOf,
  upgradeHold,
} from './construction';
import type { LonLat } from './geo';
import { CHOSEN_SPECIALTIES, RESOURCES, type ChosenSpecialty, type ResourceKey } from './ids';
import type { UnitRole, UnitTier } from './ids';
import { armedColumn } from './armed-column';
import {
  captureOrderRefusalOf,
  disbandRefusalOf,
  disbandSpanKm,
  disbandSpotsAt,
  disembarkRefusalOf,
  foundingRefusal,
  refusalDetails,
  refusalOf,
  type DisbandGround,
  type MovementAim,
} from './movement-orders';
import { isNation } from './nations';
import { patrolLineOf, type Liaison } from './patrol';
import {
  currentStock,
  type Cost,
  type OutpostView,
  type PlayerView,
  type TroopStation,
} from './player-view';
import {
  carrierIn,
  marchingTroopIds,
  type MarchStation,
  projectionKeyOf,
  recruitRefusalOf,
  stationKeyOf,
  troopsAt,
} from './troops';

/**
 * **Ce que `troops.workshop` sert et que la vue tait** : la borne invisible se compte sur l'armée
 * entière, la file sur le site, le prix sur la grille. Le résultat de la query s'y range tel quel.
 */
type Workshop = {
  readonly troopsInService: number;
  readonly troopsQueued: number;
  readonly facilities: ReadonlyArray<{
    readonly id: string;
    readonly queue: ReadonlyArray<unknown>;
  }>;
  readonly grid: ReadonlyArray<{
    readonly role: UnitRole;
    readonly unit: { readonly costs: Cost };
    readonly unitTier2: { readonly costs: Cost } | null;
  }>;
};

/**
 * **Ce que touche le joueur.** `force` est la pile posée de la rose, avec les troupes que la main
 * en tient ; `garrison`, les troupes tenues dans un bâtiment ou un avant-poste. Un bâtiment porte
 * l'atelier quand la query est arrivée : sans lui, pas de carte à former. Un camp relevé, un
 * objectif et un point stratégique offrent un ordre par pile du joueur (`OfferContext.piles`) : ce
 * que la fiche dit est ce que le brouillard laisse lire (#588).
 */
export type OfferTarget =
  | (Extract<CompassTarget, { kind: 'force' }> & { readonly troopIds: ReadonlyArray<string> })
  | {
      readonly kind: 'garrison';
      readonly station: TroopStation;
      readonly troopIds: ReadonlyArray<string>;
    }
  | (Extract<CompassTarget, { kind: 'building' }> & { readonly workshop?: Workshop })
  | Extract<CompassTarget, { kind: 'outpost' | 'camp' | 'objective' | 'strategic' }>;

/** **Une pile du joueur, telle que la fiche d'une cible l'envoie** : l'adresse, les troupes qui
 *  partiraient, et le lieu en toutes lettres pour nommer le bouton. */
export type OfferPile = {
  readonly station: MarchStation;
  readonly troopIds: ReadonlyArray<string>;
  readonly place: string;
};

/** Les faits de l'instant que la vue ne porte pas. `ground` nul : la géographie n'est pas
 *  arrivée, la place de la couronne n'est pas tranchée — dissoudre est offert, le serveur juge. */
export type OfferContext = {
  readonly now: number;
  readonly ground: DisbandGround | null;
  readonly afloat: boolean;
  readonly atAirfield: boolean;
  /** Les piles que la fiche d'un camp, d'un objectif ou d'un point stratégique propose d'envoyer.
   *  Absentes, la fiche n'offre aucun envoi. */
  readonly piles?: ReadonlyArray<OfferPile>;
};

/** Sous le pouce, au second rang de l'essentiel, ou dans un onglet de la fiche : `sheet` (fiche
 *  d'un bâtiment), `queue` (file du site), `raise` (élévation d'un avant-poste), `point`. */
type OfferRank = 'thumb' | 'second' | 'sheet' | 'queue' | 'raise' | 'point' | 'strike';

export type Offer = {
  readonly rank: OfferRank;
  /** La phrase du refus, celle du serveur ; `null`, l'ordre part. */
  readonly refusal: string | null;
  /** Ce que la confirmation dit perdu ; `null`, il part sans confirmation. */
  readonly loses: string | null;
} & (
  | { readonly key: 'found'; readonly troopIds: ReadonlyArray<string> }
  /** Un passager d'un transport de la pile. */
  | { readonly key: 'disembark'; readonly troopIds: ReadonlyArray<string> }
  /** Cible : une liaison tracée de son avant-poste (`drawnLiaisonsIn`, via `patrolLineOf`). */
  | { readonly key: 'patrol'; readonly troopId: string; readonly liaison: Liaison }
  | { readonly key: 'recall'; readonly troopId: string }
  /** Cible : le point où la pile se tient. */
  | { readonly key: 'disband'; readonly point: LonLat }
  /** Une pile attaque la cible, d'un toucher : `refusal` est celui de `refusalOf('attack')`. */
  | { readonly key: 'strike'; readonly pile: OfferPile; readonly aim: MovementAim }
  /** Une pile marche sur un point stratégique pour le prendre : le refus de la capture. */
  | { readonly key: 'march'; readonly pile: OfferPile; readonly aim: MovementAim }
  | { readonly key: 'raise'; readonly buildingId: string }
  | { readonly key: 'demolish'; readonly buildingId: string }
  | {
      readonly key: 'recruit';
      readonly buildingId: string;
      readonly role: UnitRole;
      readonly tier: UnitTier;
    }
  | {
      readonly key: 'raiseOutpost';
      readonly outpostId: string;
      readonly specialty: ChosenSpecialty | null;
    }
  | { readonly key: 'specialty'; readonly outpostId: string; readonly specialty: ChosenSpecialty }
  | { readonly key: 'dismantle'; readonly outpostId: string }
);

const stocksAt = (view: PlayerView, now: number) =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;

/**
 * **Les ordres d'un objet**, leur rang, leur refus et ce que leur confirmation dit perdu. Chaque
 * refus sort de la fonction que le serveur relit ; le prix n'en est pas un (#577). Un ordre que
 * l'objet n'a pas est absent, un ordre qu'il a et ne peut pas donner porte sa phrase.
 */
export function offersOf(
  target: OfferTarget,
  view: PlayerView,
  ctx: OfferContext,
): ReadonlyArray<Offer> {
  const blitz = notInBlitz(view.mode) !== null;
  switch (target.kind) {
    case 'force':
    case 'garrison':
      return troopOffers(target, view, ctx, blitz);
    case 'building':
      return blitz ? [] : buildingOffers(target, view, ctx);
    case 'outpost': {
      const mine = view.me.outposts.find((one) => one.id === target.id);
      return blitz || mine === undefined ? [] : outpostOffers(mine, view, ctx);
    }
    case 'camp':
    case 'objective':
    case 'strategic':
      return strikeOffers(target, view, ctx);
  }
}

/** La visée que la cible est pour `refusalOf`, la même que celle de la rose. */
function aimOfTarget(
  target: Extract<OfferTarget, { kind: 'camp' | 'objective' | 'strategic' }>,
): MovementAim {
  const [lon, lat] = target.point;
  const hostCountry = target.country ?? '';
  switch (target.kind) {
    case 'camp':
      return {
        kind: 'camp',
        campId: target.id,
        lon,
        lat,
        hostCountry,
        ground: target.ground ?? 'land',
        coastal: target.coastal ?? false,
        ...(target.walkable === undefined ? {} : { walkable: target.walkable }),
      };
    case 'objective':
      return { kind: 'objective', objectiveId: target.id, lon, lat, hostCountry };
    case 'strategic':
      return { kind: 'strategic', pointId: target.id, lon, lat, hostCountry };
  }
}

/**
 * **Un ordre par pile, son refus à sa place** (#588, ADR 0015) : le camp et l'objectif s'attaquent
 * (`refusalOf('attack')`), le point stratégique se prend (`captureOrderRefusalOf`), tous deux lus
 * sur la colonne de la pile comme le serveur la lit. Un point que je tiens n'offre rien. Aucune
 * pile, aucun ordre : la fiche le dit.
 */
function strikeOffers(
  target: Extract<OfferTarget, { kind: 'camp' | 'objective' | 'strategic' }>,
  view: PlayerView,
  ctx: OfferContext,
): Offer[] {
  if (
    target.kind === 'strategic' &&
    view.strategicPoints.find((point) => point.id === target.id)?.mine === true
  )
    return [];
  const aim = aimOfTarget(target);
  return (ctx.piles ?? []).map((pile): Offer => {
    const column = armedColumn(view, pile.station, pile.troopIds).rule;
    const code =
      target.kind === 'strategic'
        ? captureOrderRefusalOf(aim, column, false)
        : refusalOf('attack', aim, column);
    return {
      key: target.kind === 'strategic' ? 'march' : 'strike',
      rank: 'strike',
      refusal: code === null ? null : fr.errors[code](refusalDetails(aim, column)),
      loses: null,
      pile,
      aim,
    };
  });
}

function troopOffers(
  target: Extract<OfferTarget, { kind: 'force' | 'garrison' }>,
  view: PlayerView,
  ctx: OfferContext,
  blitz: boolean,
): Offer[] {
  if (target.station === null) return [];
  const station = target.station;
  const pile = troopsAt(view.me, stationKeyOf(station), marchingTroopIds(view.arcs));
  const held = pile.filter((troop) => target.troopIds.includes(troop.id));
  const offers: Offer[] = [];

  if (!blitz && target.kind === 'force' && station.kind === 'point' && held.length > 0) {
    const refusal = foundingRefusal(
      held.map((troop) => troop.role),
      target.regionId !== null &&
        view.me.buildings.some((building) => building.regionId === target.regionId),
      target.ground === 'land',
    );
    // Le serveur débite la facture : la matière qui manque se dit comme la rose la dit.
    const hold = refusal === null ? foundationHold(view, ctx.now) : null;
    offers.push({
      key: 'found',
      rank: 'thumb',
      refusal:
        refusal !== null
          ? foundingMotive(refusal, held, target, view)
          : hold === null
            ? null
            : fr.errors.INSUFFICIENT_RESOURCE({
                resource: hold.resource,
                needed: hold.needed,
                available: Math.floor(hold.available),
              }),
      loses: null,
      troopIds: held.map((troop) => troop.id),
    });
  }

  // Un passager à la fois : on débarque celui qu'on touche, la pile garde le reste à bord.
  for (const rider of held) {
    const carrier = carrierIn(rider, pile);
    if (carrier === null) continue;
    const refusal = disembarkRefusalOf({
      carrier: carrier.role,
      afloat: ctx.afloat,
      atAirfield: ctx.atAirfield,
    });
    offers.push({
      key: 'disembark',
      rank: 'thumb',
      refusal: refusal === null ? null : fr.errors[refusal](),
      loses: null,
      troopIds: [rider.id],
    });
  }

  const line = patrolLineOf(view, target.troopIds);
  if (line?.kind === 'offers')
    for (const liaison of line.liaisons)
      offers.push({
        key: 'patrol',
        rank: 'thumb',
        refusal: liaison.refusal,
        loses: null,
        troopId: target.troopIds[0] ?? '',
        liaison: liaison.ends,
      });
  // Le serveur ne refuse que la troupe hors ronde ; rappelée, la ligne le dit, l'ordre est fait.
  if (line?.kind === 'patrolling' && !line.recalled)
    offers.push({
      key: 'recall',
      rank: 'thumb',
      refusal: null,
      loses: null,
      troopId: line.troopId,
    });

  if (station.kind === 'point') {
    const [lon, lat] = station.lonLat;
    const pieces = pile.filter((troop) => carrierIn(troop, pile) === null);
    const nation = isNation(view.me.nation) ? view.me.nation : undefined;
    const refusal = disbandRefusalOf({
      onPoint: true,
      pieces: pieces.length,
      blitz,
      loaded: view.me.lootPoints.some((spot) => spot.lon === lon && spot.lat === lat),
      room: () =>
        ctx.ground === null ||
        disbandSpotsAt(station.lonLat, pieces.length, disbandSpanKm(pieces, nation), ctx.ground) !==
          null,
    });
    // Une troupe seule n'est pas une escouade, et la Blitz n'en a pas : rien à dissoudre.
    if (refusal !== 'NOT_A_SQUAD' && refusal !== 'NO_SQUADS_IN_BLITZ')
      offers.push({
        key: 'disband',
        rank: 'second',
        refusal: refusal === null ? null : fr.errors[refusal](),
        loses: fr.compass.disbandConsequence,
        point: station.lonLat,
      });
  }
  return offers;
}

function buildingOffers(
  target: Extract<OfferTarget, { kind: 'building' }>,
  view: PlayerView,
  ctx: OfferContext,
): Offer[] {
  const standing = view.me.buildings.find((one) => one.id === target.id);
  if (standing === undefined) return [];
  const offers: Offer[] = [];

  const hold = upgradeHold(standing, view, ctx.now);
  offers.push({
    key: 'raise',
    rank: 'sheet',
    refusal: hold === null || hold.kind === 'materials' ? null : upgradeHoldText(hold),
    loses: null,
    buildingId: standing.id,
  });

  const workshop = target.workshop;
  if (workshop !== undefined) {
    const stocks = stocksAt(view, ctx.now);
    const siteQueue = workshop.facilities.find((one) => one.id === standing.id)?.queue.length ?? 0;
    for (const entry of workshop.grid) {
      if (projectionKeyOf(entry.role) !== standing.key) continue;
      const cards = [{ tier: 1 as UnitTier, costs: entry.unit.costs }];
      if (entry.unitTier2 !== null) cards.push({ tier: 2, costs: entry.unitTier2.costs });
      for (const card of cards) {
        const refusal = recruitRefusalOf(entry.role, card.tier, standing, {
          researched: view.me.research.researched,
          army: workshop.troopsInService + workshop.troopsQueued,
          siteQueue,
          costs: card.costs,
          stocks,
        });
        const { code, ...details } = refusal ?? { code: null };
        offers.push({
          key: 'recruit',
          rank: 'queue',
          refusal: code === null ? null : fr.errors[code](details),
          loses: null,
          buildingId: standing.id,
          role: entry.role,
          tier: card.tier,
        });
      }
    }
  }

  const razes = demolitionRefusalOf({
    key: standing.key,
    mine: true,
    underCapture: underCaptureOf(view, standing.id),
  });
  // Le quartier général ne se rase pas : l'ordre n'existe pas pour lui.
  if (razes !== 'HQ_NEVER_DEMOLISHED')
    offers.push({
      key: 'demolish',
      rank: 'sheet',
      refusal: razes === null ? null : fr.errors[razes](),
      loses: fr.compass.demolishConsequence,
      buildingId: standing.id,
    });
  return offers;
}

function outpostOffers(outpost: OutpostView, view: PlayerView, ctx: OfferContext): Offer[] {
  const offers: Offer[] = [];
  const facts = {
    level: outpost.level,
    specialty: outpost.specialty,
    disabled: outpost.disabledMinutesLeft !== null,
    queued: pledgedOutposts(view).has(outpost.id),
    stocks: stocksAt(view, ctx.now),
  };

  // Un chantier n'a pas de niveau à monter : il a une heure à attendre.
  if (outpost.standsAt === null) {
    const hold = outpostRaiseHold(
      facts,
      outpost.nextLevelCost,
      outpost.atMaxLevel ? outpost.level : outpost.level + 1,
    );
    const refusal = hold === null || hold.kind === 'materials' ? null : raiseHoldText(hold);
    for (const specialty of raiseChoosesSpecialty(outpost.level) ? CHOSEN_SPECIALTIES : [null])
      offers.push({
        key: 'raiseOutpost',
        rank: 'raise',
        refusal,
        loses: null,
        outpostId: outpost.id,
        specialty,
      });

    for (const specialty of CHOSEN_SPECIALTIES) {
      const refused = specialtyRefusalOf(facts, specialty, outpost.respecialtyCost);
      // Au niveau 1 le choix passe par l'élévation ; son propre métier ne se choisit pas.
      if (refused?.kind === 'levelOne' || refused?.kind === 'held') continue;
      offers.push({
        key: 'specialty',
        rank: 'raise',
        refusal:
          refused === null || refused.kind === 'materials' ? null : specialtyRefusalText(refused),
        loses: null,
        outpostId: outpost.id,
        specialty,
      });
    }
  }

  const dismantles = outpostDismantleRefusalOf({
    mine: true,
    serving: outpost.serving,
    besieged: outpost.besieged,
  });
  offers.push({
    key: 'dismantle',
    rank: 'point',
    refusal: dismantles === null ? null : fr.errors[dismantles](),
    loses: fr.compass.dismantleConsequence,
    outpostId: outpost.id,
  });
  return offers;
}
