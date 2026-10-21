import { fanOf, pileAt, marchOf, slotCost } from './compass-fan';
import { fr } from '@/i18n/fr';
import type { TourTrace } from './cargo-tag';
import {
  boardingRefusalDetails,
  boardingRefusalOf,
  type Boarding,
  type Column,
  type MovementAim,
} from './movement-orders';
import {
  carriersAmong,
  deliverRefusalOf,
  airdropRefusalOf,
  squadTarget,
  hullsAmong,
  loadTotal,
  tourRefusalOf,
  type LoadingPlace,
} from './logistics';
import { fareOf, PROJECTION_BY_DOMAIN, seatsOf, stationKeyOf } from './troops';
import {
  type OutpostView,
  type PlayerView,
  type TroopStation,
  type TroopView,
} from './player-view';
import type { Compass, CompassAction, CompassTarget } from './compass-rose';

/** Un transport de la main porte-t-il quelque chose ? Livrer et larguer n'ont d'objet que là. */
const carriesLoad = (held: ReadonlyArray<TroopView>) =>
  carriersAmong(held).some((troop) => loadTotal(troop.load) > 0);

/**
 * **Un transport chargé lâché sur son avant-poste y livre** (ADR 0028 §4) : la branche passe
 * devant l'entrée en garnison, que Tab rend. Refusée — dépôt plein, avion hors escale —, elle
 * dit pourquoi et ne laisse pas entrer en douce : c'est livrer que la main portait. Il faut que
 * la marche elle-même soit légale, sinon la rose garde son motif.
 */
export function withDelivery(
  fan: Compass,
  outpostId: string,
  view: PlayerView,
  heldTroopIds: ReadonlyArray<string>,
): Compass {
  const held = view.me.troops.filter((troop) => heldTroopIds.includes(troop.id));
  const carriers = carriersAmong(held);
  const outpost = view.me.outposts.find((candidate) => candidate.id === outpostId);
  if (outpost === undefined || !carriesLoad(held) || marchOf(fan) === undefined) return fan;
  const depot = depotOfView(outpost);
  const marching = marchOf(fan)!;
  const carrier = carriers.length === 1 ? carriers[0]! : null;
  const touring =
    carrier !== null &&
    tourRefusalOfView(view, carrier, [outpostId]) === null &&
    deliverRefusalOf([carrier], depot, true) === null;
  const tour: ReadonlyArray<CompassAction> = touring
    ? [
        {
          key: 'tour',
          pictogram: 'crate',
          label: fr.compass.tour,
          cost: slotCost(view),
          consequence: fr.compass.tourConsequence,
          outpostId,
          carrierId: carrier!.id,
          aim: marching.aim,
        },
      ]
    : [];
  const drop = airdropBranch(view, fan, held, { kind: 'outpost', outpostId }, fan.name).actions;
  const refusal = deliverRefusalOf(carriers, depot);
  if (refusal !== null) {
    const { code, ...details } = refusal;
    const actions = [...drop, ...tour];
    return { ...fan, actions, refusal: actions.length > 0 ? null : fr.errors[code](details) };
  }
  const deliver: CompassAction = {
    key: 'deliver',
    pictogram: 'crate',
    label: fr.compass.deliver,
    cost: slotCost(view),
    consequence: fr.compass.deliverConsequence,
    outpostId,
    destination: fan.name,
    aim: marching.aim,
  };
  return { ...fan, actions: [deliver, ...drop, ...tour, ...fan.actions], refusal: null };
}

/** **Le dépôt d'un de mes points**, tel que livrer et tourner le lisent — la lecture de
 *  `logistics.depotOf`. */
const depotOfView = (outpost: OutpostView) => ({
  level: outpost.level,
  standing: outpost.standsAt === null,
  depot: outpost.depot,
  capacity: outpost.depotCapacity,
});

/** **La tournée de ce transport par ces dépôts**, lue comme `tours.start` la lit. */
const tourRefusalOfView = (view: PlayerView, carrier: TroopView, stops: ReadonlyArray<string>) =>
  tourRefusalOf({
    role: carrier.role,
    place: loadingPlaceOf(view, carrier),
    busy: carrier.tour === undefined ? null : 'touring',
    load: carrier.load,
    stops,
    baseOutpostId: carrier.stationedAt.kind === 'outpost' ? carrier.stationedAt.outpostId : null,
  });

/** **Où se tient le transport, pour charger ou partir en tournée** : un de mes bâtiments, un de
 *  mes avant-postes debout, ou ailleurs — la lecture de `logistics.placeOf`. */
function loadingPlaceOf(view: PlayerView, troop: TroopView): LoadingPlace {
  const at = troop.stationedAt;
  if (at.kind === 'building') {
    const building = view.me.buildings.find((one) => one.id === at.buildingId);
    if (building !== undefined) return { kind: 'building', key: building.key };
  }
  if (at.kind === 'outpost') {
    const outpost = view.me.outposts.find((one) => one.id === at.outpostId);
    if (outpost !== undefined && outpost.standsAt === null)
      return { kind: 'outpost', level: outpost.level };
  }
  return { kind: 'elsewhere' };
}

/**
 * **La tournée en cours de tracé** : le transport en main ne fait plus qu'ajouter des dépôts à sa
 * boucle, quatre au plus, chacun une fois ; ailleurs, la rose dit où le lâcher. L'étiquette du
 * transport la lance ou l'efface.
 */
export function traceCompass(target: CompassTarget, view: PlayerView, trace: TourTrace): Compass {
  const carrier = view.me.troops.find((troop) => troop.id === trace.carrierId);
  const outpost =
    target.kind === 'outpost'
      ? view.me.outposts.find((candidate) => candidate.id === target.id)
      : undefined;
  const name = target.kind === 'outpost' ? target.name : fr.compass.fallbackOutpost;
  const kicker = fr.compass.tracing(trace.stops.length);
  if (carrier === undefined || outpost === undefined)
    return { kicker, name, actions: [], refusal: fr.compass.traceElsewhere };
  const stops = [...trace.stops, outpost.id];
  const refusal =
    tourRefusalOfView(view, carrier, stops) ??
    deliverRefusalOf([carrier], depotOfView(outpost), true);
  if (refusal !== null) {
    const { code, ...details } = refusal;
    return { kicker, name, actions: [], refusal: fr.errors[code](details) };
  }
  return {
    kicker,
    name,
    refusal: null,
    actions: [
      {
        key: 'tourStop',
        pictogram: 'crate',
        label: fr.compass.tourStop(stops.length),
        cost: null,
        consequence: fr.compass.tourConsequence,
        outpostId: outpost.id,
        carrierId: carrier.id,
      },
    ],
  };
}

/**
 * **Embarquer, depuis la rose** (révision de l'ADR 0025, 15/10) : le premier transport de cette
 * adresse qui prend ce que la main tient. Au même point, c'est sur-le-champ (`movements.board`) ;
 * plus loin, la marche même que `aimed` donnerait, qui monte à bord en arrivant (`boardsOn`).
 * `null` quand rien n'y porte personne.
 */
export function boardingAt(
  station: TroopStation,
  aimed: MovementAim | null,
  name: string,
  view: PlayerView,
  column: Column,
  heldTroopIds: ReadonlyArray<string>,
): { readonly actions: ReadonlyArray<CompassAction>; readonly refusal: string | null } | null {
  const pile = pileAt(station, view);
  const held = view.me.troops.filter((troop) => heldTroopIds.includes(troop.id));
  const carriers = pile.filter(
    (troop) => !heldTroopIds.includes(troop.id) && fareOf(troop.role, PROBE, []) !== null,
  );
  if (carriers.length === 0) return null;
  const boardings = carriers.map((carrier) =>
    boardingOf(
      view.me.buildings,
      station,
      carrier,
      held,
      aimed === null ? pile : [...pile, ...held],
    ),
  );
  const fit = boardings.find((boarding) => boardingRefusalOf(boarding) === null);
  if (fit === undefined) {
    const first = boardings[0]!;
    return {
      actions: [],
      refusal: fr.errors[boardingRefusalOf(first)!](boardingRefusalDetails(first)),
    };
  }
  const { needed } = boardingRefusalDetails(fit);
  const label = fr.compass.boardOnto(fr.compass.transports([fit.carrier.role]));
  const places = boardPlacesOf(fit);
  if (aimed === null)
    return {
      actions: [
        {
          key: 'board',
          pictogram: 'anchor',
          label,
          cost: fr.compass.boardNow,
          consequence: places,
          carrierId: fit.carrier.id,
          need: needed,
        },
      ],
      refusal: null,
    };
  /** En Blitz, le bâtiment que tient le transport ne ferme pas la porte à qui vient y monter. */
  const open =
    column.blitz === undefined || aimed.kind !== 'building'
      ? column
      : {
          ...column,
          blitz: {
            ...column.blitz,
            occupiedBuildingIds: new Set(
              [...column.blitz.occupiedBuildingIds].filter((id) => id !== aimed.buildingId),
            ),
          },
        };
  const fan = fanOf(name, view, open, [aimed]);
  const walk = fan.actions.find((action) => action.key === 'aim' && action.type === 'march');
  if (walk === undefined || walk.key !== 'aim') return { actions: [], refusal: fan.refusal };
  return {
    actions: [
      {
        ...walk,
        label,
        pictogram: 'anchor',
        consequence: `${fr.compass.boardOnArrival} ${places}`,
        boardsOn: fit.carrier.id,
        boardNeed: needed,
      },
    ],
    refusal: null,
  };
}

/** **Le mouvement d'embarquement que la règle lit** : mes coques hors bord, le transport visé, la
 *  pile où il se tient, et si l'on est à l'aérodrome. */
export function boardingOf(
  buildings: PlayerView['me']['buildings'],
  station: TroopStation,
  carrier: TroopView,
  held: ReadonlyArray<TroopView>,
  pile: ReadonlyArray<TroopView>,
): Boarding {
  const site =
    station.kind === 'building'
      ? buildings.find((building) => building.id === station.buildingId)
      : undefined;
  return {
    carrier,
    riders: hullsAmong(held),
    pile,
    atAirfield: site?.key === PROJECTION_BY_DOMAIN.air,
  };
}

/** **Les places d'après**, dites : ce que l'embarquement laisse sur les sièges du transport. */
export function boardPlacesOf(boarding: Boarding): string {
  const { needed, offered } = boardingRefusalDetails(boarding);
  const seats = seatsOf(boarding.carrier.role);
  return fr.compass.boardPlaces(seats - offered + needed, seats);
}

/** Une recrue d'infanterie : ce qu'un transport prend au moins, s'il prend quelqu'un. */
const PROBE = { id: '', role: 'infantry' as const };

/**
 * **Une autre pile à moi, visée** : y embarquer si un transport s'y tient, ou la rejoindre — une
 * marche jusqu'à son point exact, qui ne fait plus qu'une pile des deux. En Blitz, une unité de
 * combat ne se joint pas à une autre (règle de Pierre, 15/10) : seul un transport en porte.
 */
export function towardsMyPile(
  target: Extract<CompassTarget, { kind: 'force' }>,
  station: Extract<TroopStation, { kind: 'point' }>,
  view: PlayerView,
  column: Column,
  heldTroopIds: ReadonlyArray<string>,
): Compass {
  const aimed: MovementAim = {
    kind: 'point',
    lon: station.lonLat[0],
    lat: station.lonLat[1],
    coastal: station.coastal,
    ground: target.onLand ? 'land' : 'sea',
    /** Rejoindre est une marche, jamais un assaut : le relevé n'y décide de rien. */
    surveyed: false,
  };
  const onto = boardingAt(station, aimed, target.name, view, column, heldTroopIds);
  const fan = fanOf(target.name, view, column, [aimed]);
  const there = view.me.troops.filter(
    (troop) => stationKeyOf(troop.stationedAt) === stationKeyOf(station),
  ).length;
  const join =
    column.blitz === undefined
      ? fan.actions.flatMap((action) =>
          action.key === 'aim' && action.type === 'march'
            ? [
                {
                  ...action,
                  label: fr.compass.join,
                  consequence: fr.compass.joinConsequence,
                  join: { formed: there === 1, pieces: there + heldTroopIds.length },
                },
              ]
            : [],
        )
      : [];
  const airdropped = airdropBranch(
    view,
    fan,
    view.me.troops.filter((troop) => heldTroopIds.includes(troop.id)),
    { kind: 'squad', station },
    target.name,
  );
  const actions = [...(onto?.actions ?? []), ...airdropped.actions, ...join];
  return {
    kicker: fr.compass.aiming(column.roles.length),
    name: target.name,
    actions,
    /** Le motif d'un largage refusé se dit à côté de « rejoindre » : l'avion chargé qu'on tient
     *  n'apprendrait sinon jamais pourquoi la branche manque. */
    refusal:
      airdropped.refusal ??
      (actions.length > 0
        ? null
        : (onto?.refusal ?? (column.blitz === undefined ? fan.refusal : fr.compass.noSquad))),
  };
}

/**
 * **Larguer** (ADR 0028 §4) : l'avion chargé en main, lâché sur un de mes avant-postes ou sur une de
 * mes escouades isolées. Rien si la main ne porte aucun avion chargé, ou si la marche elle-même
 * n'est pas légale (`marchOf`) ; sinon la branche, ou le motif de `airdropRefusalOf` — ancrée,
 * déjà pleine, dépôt plein. Le plein de l'aller-retour se dit à l'aperçu de la visée.
 */
function airdropBranch(
  view: PlayerView,
  fan: Compass,
  held: ReadonlyArray<TroopView>,
  at:
    | { readonly kind: 'outpost'; readonly outpostId: string }
    | { readonly kind: 'squad'; readonly station: Extract<TroopStation, { kind: 'point' }> },
  name: string,
): { readonly actions: ReadonlyArray<CompassAction>; readonly refusal: string | null } {
  const march = marchOf(fan);
  if (march === undefined || !carriesLoad(held)) return { actions: [], refusal: null };
  const outpost =
    at.kind === 'outpost'
      ? view.me.outposts.find((candidate) => candidate.id === at.outpostId)
      : undefined;
  if (at.kind === 'outpost' && outpost === undefined) return { actions: [], refusal: null };
  const refusal = airdropRefusalOf(
    hullsAmong(held),
    at.kind === 'outpost'
      ? { kind: 'outpost', ...depotOfView(outpost!) }
      : squadTarget(
          pileAt(at.station, view).map((troop) => ({
            id: troop.id,
            role: troop.role,
            supplies: troop.supplies,
            anchored: troop.anchored === true,
          })),
        ),
  );
  if (refusal !== null) {
    const { code, ...details } = refusal;
    return { actions: [], refusal: fr.errors[code](details) };
  }
  return {
    actions: [
      {
        key: 'airdrop',
        pictogram: 'crate',
        label: fr.compass.airdrop,
        cost: slotCost(view),
        consequence:
          at.kind === 'outpost'
            ? fr.compass.airdropOutpostConsequence
            : fr.compass.airdropSquadConsequence,
        target:
          at.kind === 'outpost'
            ? { kind: 'outpost', outpostId: at.outpostId }
            : { kind: 'squad', point: at.station.lonLat },
        aim: march.aim,
        destination: name,
      },
    ],
    refusal: null,
  };
}
