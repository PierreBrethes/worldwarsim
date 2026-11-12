import { AIR_STOP_LEVEL, LOAD_CAPACITY_BY_ROLE, TOUR_MAX_STOPS } from '../../convex/constants';
import { RESOURCES, type BuildingKey, type ResourceKey, type UnitRole } from './ids';
import type { Asset } from './nation-assets';
import { topUp, type Carrying, type Supplies, type SupplyStocks } from './supplies';
import { carrierIn, type Seated } from './troops';

/**
 * **La logistique passe par les pièces** (ADR 0028 §4, Mondiale seule) : un dépôt d'avant-poste
 * et un transport portent munitions, pétrole et charbon, dans **une seule charge maximale**
 * partagée librement. Le serveur et l'écran lisent les mêmes fonctions.
 */
export type SupplyLoad = SupplyStocks;

export const SUPPLY_KEYS: ReadonlyArray<keyof SupplyLoad> = ['ammunition', 'oil', 'coal'];

export const emptyLoad = (): SupplyLoad => ({ ammunition: 0, oil: 0, coal: 0 });

export const loadTotal = (load: SupplyLoad | undefined): number =>
  load === undefined ? 0 : load.ammunition + load.oil + load.coal;

export const loadCapacityOf = (role: UnitRole): number => LOAD_CAPACITY_BY_ROLE[role];

/**
 * **La récolte à bord** (ADR 0041 §2) : ce qu'un transport a pris aux tas, cinq ressources, à
 * part de sa charge (`load`, trois clés). Les deux partagent une seule capacité ; un dépôt, un
 * largage ou une caisse ne lisent que la charge.
 */
export type HarvestLoad = Readonly<Record<ResourceKey, number>>;

const harvestTotal = (harvest: HarvestLoad | undefined): number =>
  harvest === undefined ? 0 : RESOURCES.reduce((sum, key) => sum + harvest[key], 0);

/** **La place à bord**, sur des totaux : la capacité, moins la charge, moins la récolte. */
const roomLeft = (capacity: number, loaded: number, harvested: number): number =>
  capacity - loaded - harvested;

/** **La place à bord** : la capacité, moins la charge, moins la récolte. */
export const roomAboard = (
  capacity: number,
  load: SupplyLoad | undefined,
  harvest: HarvestLoad | undefined,
): number => roomLeft(capacity, loadTotal(load), harvestTotal(harvest));

/** **Prendre au tas** (ADR 0041 §2) : des unités entières dans la place à bord ; la fraction
 *  reste au tas. */
export function takeFromHeap(
  heap: number,
  room: number,
): { readonly taken: number; readonly left: number } {
  const taken = Math.max(0, Math.floor(Math.min(heap, room)));
  return { taken, left: heap - taken };
}

/**
 * **Une tournée à sec roule au pas** (ADR 0041 §4) : un camion ou un cargo que le seul refus du
 * plein arrête part quand même. Tout autre refus reste une attente, et l'avion à sec reste au sol.
 */
export const crawlsOn = (role: UnitRole, code: string): boolean =>
  (role === 'landTransport' || role === 'cargo') && code === 'NOT_ENOUGH_FUEL';

/** **Une recharge bornée par la place à bord** : chaque ressource, dans l'ordre, tant qu'il en tient. */
export function fitToRoom(need: SupplyLoad, room: number): SupplyLoad {
  const fitted: { -readonly [K in keyof SupplyLoad]: number } = emptyLoad();
  let left = Math.max(0, room);
  for (const key of SUPPLY_KEYS) {
    fitted[key] = Math.min(need[key], left);
    left -= fitted[key];
  }
  return fitted;
}

/**
 * **Les transports hors bord d'une colonne** : ceux qui portent une charge et ne sont pas à bord
 * d'un autre de la même colonne — ceux qui déchargent à une livraison. Le serveur et la rose
 * lisent celle-ci.
 */
export const carriersAmong = <T extends Seated>(troops: ReadonlyArray<T>): T[] =>
  troops.filter((troop) => loadCapacityOf(troop.role) > 0 && carrierIn(troop, troops) === null);

export const isSupplyKey = (key: ResourceKey): key is keyof SupplyLoad =>
  (SUPPLY_KEYS as ReadonlyArray<string>).includes(key);

/** **Où chaque transport se charge** (Q29) : un camion au QG ou à un entrepôt, un cargo au port,
 *  un avion à l'aérodrome ; ailleurs, au dépôt de l'avant-poste où il se tient. */
const LOADS_AT: Partial<Record<UnitRole, ReadonlyArray<BuildingKey>>> = {
  landTransport: ['hq', 'warehouse'],
  cargo: ['port'],
  airTransport: ['airfield'],
};

/** The buildings a transport of `role` loads at: none for a role that carries nothing. */
export const loadsAt = (role: UnitRole): ReadonlyArray<BuildingKey> => LOADS_AT[role] ?? [];

/** Là où se tient le transport : un de mes bâtiments, un de mes avant-postes debout, ou ailleurs. */
export type LoadingPlace =
  | { readonly kind: 'building'; readonly key: BuildingKey }
  | { readonly kind: 'outpost'; readonly level: number }
  | { readonly kind: 'elsewhere' };

/** Le transport roule (`underway`) ou tourne (`touring`) : il ne se charge pas à la main. */
export type Busy = 'underway' | 'touring' | null;

export type LoadRefusal =
  | { readonly code: 'NOT_A_TRANSPORT' }
  | { readonly code: 'LOAD_NOT_A_SUPPLY' }
  | { readonly code: 'LOAD_AMOUNT_INVALID' }
  | { readonly code: 'TRANSPORT_UNDERWAY' }
  | { readonly code: 'TRANSPORT_ON_TOUR' }
  | { readonly code: 'LOAD_NOT_HERE'; readonly role: UnitRole }
  | { readonly code: 'NO_AIR_STOP'; readonly level: number }
  | { readonly code: 'LOAD_FULL'; readonly room: number; readonly capacity: number }
  | {
      readonly code: 'INSUFFICIENT_RESOURCE';
      readonly resource: ResourceKey;
      readonly needed: number;
      readonly available: number;
    };

/** **L'escale aérienne** (ADR 0028 §5) : un avant-poste de niveau 2 reçoit l'avion, qui s'y
 *  charge, y livre et en repart comme d'un aérodrome — la lecture du départ des deux côtés. */
export const isAirStop = (level: number): boolean => level >= AIR_STOP_LEVEL;

/** **Un avion ne se pose qu'à une escale**. */
const airStopRefusal = (role: UnitRole, level: number) =>
  role === 'airTransport' && !isAirStop(level)
    ? ({ code: 'NO_AIR_STOP', level: AIR_STOP_LEVEL } as const)
    : null;

const idleRefusal = (busy: Busy) =>
  busy === 'underway'
    ? ({ code: 'TRANSPORT_UNDERWAY' } as const)
    : busy === 'touring'
      ? ({ code: 'TRANSPORT_ON_TOUR' } as const)
      : null;

/** **Est-ce un point de chargement pour ce transport ?** Le même lieu sert à charger et à
 *  partir en tournée. */
export const loadsHere = (role: UnitRole, place: LoadingPlace) => {
  if (place.kind === 'outpost') return airStopRefusal(role, place.level);
  if (place.kind === 'elsewhere' || !loadsAt(role).includes(place.key))
    return { code: 'LOAD_NOT_HERE', role } as const;
  return null;
};

/**
 * **Charger** (ADR 0028 §4) : on glisse des jetons sur un transport, là où il se charge, dans
 * la limite de sa charge. `store` est ce que tient le plateau personnel, ou le dépôt, pour cette
 * ressource. La règle que la main lit au survol et que `logistics.load` relit.
 */
export function loadRefusalOf({
  role,
  place,
  busy,
  held,
  harvest,
  resource,
  amount,
  store,
}: {
  readonly role: UnitRole;
  readonly place: LoadingPlace;
  readonly busy: Busy;
  readonly held: SupplyLoad;
  readonly harvest?: HarvestLoad | undefined;
  readonly resource: ResourceKey;
  readonly amount: number;
  readonly store: number;
}): LoadRefusal | null {
  const capacity = loadCapacityOf(role);
  if (capacity === 0) return { code: 'NOT_A_TRANSPORT' };
  if (!isSupplyKey(resource)) return { code: 'LOAD_NOT_A_SUPPLY' };
  if (!Number.isFinite(amount) || amount < 1) return { code: 'LOAD_AMOUNT_INVALID' };
  const idle = idleRefusal(busy);
  if (idle !== null) return idle;
  const here = loadsHere(role, place);
  if (here !== null) return here;
  const room = roomAboard(capacity, held, harvest);
  if (amount > room) return { code: 'LOAD_FULL', room, capacity };
  if (amount > store)
    return { code: 'INSUFFICIENT_RESOURCE', resource, needed: amount, available: store };
  return null;
}

/** **Ce qu'un dépôt prend d'une charge** : dans la limite de sa place, ressource par ressource. */
export function deliveryOf(
  load: SupplyLoad,
  depot: SupplyLoad,
  capacity: number,
): { readonly moved: SupplyLoad; readonly kept: SupplyLoad } {
  let room = Math.max(0, capacity - loadTotal(depot));
  const moved: { -readonly [K in keyof SupplyLoad]: number } = emptyLoad();
  const kept: { -readonly [K in keyof SupplyLoad]: number } = { ...load };
  for (const key of SUPPLY_KEYS) {
    const n = Math.min(room, kept[key]);
    moved[key] = n;
    kept[key] -= n;
    room -= n;
  }
  return { moved, kept };
}

export const addLoads = (left: SupplyLoad, right: SupplyLoad): SupplyLoad => ({
  ammunition: left.ammunition + right.ammunition,
  oil: left.oil + right.oil,
  coal: left.coal + right.coal,
});

export type DeliverRefusal =
  | { readonly code: 'NOTHING_TO_DELIVER' }
  | { readonly code: 'DEPOT_NOT_STANDING' }
  | { readonly code: 'DEPOT_FULL'; readonly capacity: number }
  | { readonly code: 'NO_AIR_STOP'; readonly level: number };

/**
 * **Livrer** (ADR 0028 §4) : on lâche le transport chargé sur un de ses avant-postes. Une
 * tournée ne refuse pas un dépôt plein, elle le saute (`visitPlan`).
 */
export function deliverRefusalOf(
  transports: ReadonlyArray<{ readonly role: UnitRole; readonly load?: SupplyLoad }>,
  outpost: {
    readonly level: number;
    readonly standing: boolean;
    readonly depot: SupplyLoad;
    readonly capacity: number;
  },
  tour = false,
): DeliverRefusal | null {
  const loaded = transports.filter((transport) => loadTotal(transport.load) > 0);
  if (loaded.length === 0) return { code: 'NOTHING_TO_DELIVER' };
  for (const transport of loaded) {
    const air = airStopRefusal(transport.role, outpost.level);
    if (air !== null) return air;
  }
  if (!outpost.standing) return { code: 'DEPOT_NOT_STANDING' };
  if (!tour && loadTotal(outpost.depot) >= outpost.capacity)
    return { code: 'DEPOT_FULL', capacity: outpost.capacity };
  return null;
}

export type LendLeaseRefusal =
  | { readonly code: 'UNKNOWN_OUTPOST' }
  | { readonly code: 'FOREIGN_DEPOT' }
  | { readonly code: 'LEND_LEASE_TRANSPORTS_ONLY' }
  | { readonly code: 'NOTHING_TO_DELIVER' };

/**
 * **À quel dépôt une colonne livre** (ADR 0039 §3) : au sien, ou, par le Prêt-bail, à celui d'un
 * avant-poste étranger que son relevé garde. Rien du dépôt de l'autre n'est lu ici : plein,
 * démantelé ou désactivé, il se relit à l'arrivée. Un dépôt étranger qu'on n'a pas relevé se
 * refuse du mot d'un dépôt qui n'existe pas. `troops` est toute la colonne, passagers compris :
 * on ne pose pas de garnison chez l'autre. `deliver`, `unloadAt` et la rose la lisent.
 */
export function depotAccessOf({
  mine,
  surveyed,
  asset,
  troops,
}: {
  readonly mine: boolean;
  readonly surveyed: boolean;
  readonly asset: Asset | null;
  readonly troops: ReadonlyArray<{ readonly role: UnitRole; readonly load?: SupplyLoad }>;
}):
  | { readonly kind: 'own' }
  | { readonly kind: 'lendLease' }
  | { readonly kind: 'refused'; readonly refusal: LendLeaseRefusal } {
  if (mine) return { kind: 'own' };
  const refused = (refusal: LendLeaseRefusal) => ({ kind: 'refused' as const, refusal });
  if (!surveyed) return refused({ code: 'UNKNOWN_OUTPOST' });
  if (asset !== 'lendLease') return refused({ code: 'FOREIGN_DEPOT' });
  if (troops.some((troop) => loadCapacityOf(troop.role) === 0))
    return refused({ code: 'LEND_LEASE_TRANSPORTS_ONLY' });
  if (!troops.some((troop) => loadTotal(troop.load) > 0))
    return refused({ code: 'NOTHING_TO_DELIVER' });
  return { kind: 'lendLease' };
}

/** **Un transport en tournée, une troupe en ronde, ne prennent pas d'autre ordre** (ADR 0028,
 *  ADR 0037 §10) : on les rappelle d'abord. La rose le dit sur la colonne en main, la marche le
 *  relit ; le refus de la ronde nomme la troupe. */
export const onTourRefusalOf = (
  troops: ReadonlyArray<{
    readonly role: UnitRole;
    readonly tour?: unknown;
    readonly patrol?: unknown;
  }>,
):
  | { readonly code: 'TRANSPORT_ON_TOUR' }
  | { readonly code: 'ON_PATROL'; readonly role: UnitRole }
  | null => {
  if (troops.some((troop) => troop.tour !== undefined)) return { code: 'TRANSPORT_ON_TOUR' };
  const patrolling = troops.find((troop) => troop.patrol !== undefined);
  return patrolling === undefined ? null : { code: 'ON_PATROL', role: patrolling.role };
};

/** **Ce que la tournée remonte à bord** pour retrouver sa consigne. */
export const missingOf = (consigne: SupplyLoad, held: SupplyLoad): SupplyLoad => ({
  ammunition: Math.max(0, consigne.ammunition - held.ammunition),
  oil: Math.max(0, consigne.oil - held.oil),
  coal: Math.max(0, consigne.coal - held.coal),
});

/**
 * **Un arrêt de tournée** (ADR 0041 §2) : un dépôt d'avant-poste, qui reçoit de la charge, ou une
 * exploitation, où le transport prend le tas. L'ordre est celui que le joueur a tracé.
 */
export type TourStop<D extends string = string, S extends string = string> =
  { readonly kind: 'depot'; readonly id: D } | { readonly kind: 'site'; readonly id: S };

/** Un arrêt tel que le plan le lit : la place d'un dépôt, ou ce qu'un tas tient. */
export type PlannedStop<D extends string, S extends string> =
  | {
      readonly kind: 'depot';
      readonly id: D;
      readonly depot: SupplyLoad;
      readonly capacity: number;
    }
  | { readonly kind: 'site'; readonly id: S; readonly heap: number };

/** **Les arrêts qu'un tour visite vraiment** : un dépôt qui ne prendrait rien de ce qui reste à
 *  bord est sauté, comme un tas de moins d'une unité ou un site quand plus rien ne tient à bord. */
export function visitPlan<D extends string, S extends string = never>(
  aboard: {
    readonly load: SupplyLoad;
    readonly harvest: HarvestLoad;
    readonly capacity: number;
  },
  stops: ReadonlyArray<PlannedStop<D, S>>,
): {
  readonly visit: ReadonlyArray<TourStop<D, S>>;
  readonly skipped: ReadonlyArray<TourStop<D, S>>;
} {
  let left = aboard.load;
  let harvested = harvestTotal(aboard.harvest);
  const visit: Array<TourStop<D, S>> = [];
  const skipped: Array<TourStop<D, S>> = [];
  for (const stop of stops) {
    const tourStop = { kind: stop.kind, id: stop.id } as TourStop<D, S>;
    if (stop.kind === 'depot') {
      const { moved, kept } = deliveryOf(left, stop.depot, stop.capacity);
      if (loadTotal(moved) === 0) skipped.push(tourStop);
      else {
        visit.push(tourStop);
        left = kept;
      }
      continue;
    }
    const { taken } = takeFromHeap(
      stop.heap,
      roomLeft(aboard.capacity, loadTotal(left), harvested),
    );
    if (taken === 0) skipped.push(tourStop);
    else {
      visit.push(tourStop);
      harvested += taken;
    }
  }
  return { visit, skipped };
}

/** **La prise bornée par sa source** : la main prend le bac entier, en jetons entiers. */
export function grabbedWithin(grabbed: number, store: number): number {
  return Math.max(0, Math.min(grabbed, Math.floor(store)));
}

/**
 * **Un dépôt démantelé revient au plateau personnel** dans la limite de l'entrepôt (`room`, la
 * place libre de chaque bac) ; le surplus est perdu. La carte de démantèlement le dit avant le
 * geste, le serveur le crédite.
 */
export function depotRefundOf(
  depot: SupplyLoad,
  room: SupplyLoad,
): { readonly returned: SupplyLoad; readonly lost: SupplyLoad } {
  const returned: { -readonly [K in keyof SupplyLoad]: number } = emptyLoad();
  const lost: { -readonly [K in keyof SupplyLoad]: number } = emptyLoad();
  for (const key of SUPPLY_KEYS) {
    returned[key] = Math.min(depot[key], Math.max(0, Math.floor(room[key])));
    lost[key] = depot[key] - returned[key];
  }
  return { returned, lost };
}

export type TourRefusal =
  | { readonly code: 'NOT_A_TRANSPORT' }
  | { readonly code: 'TRANSPORT_UNDERWAY' }
  | { readonly code: 'TRANSPORT_ON_TOUR' }
  | { readonly code: 'TOUR_NOT_AT_LOADING_POINT'; readonly role: UnitRole }
  | { readonly code: 'NO_AIR_STOP'; readonly level: number }
  | { readonly code: 'TOUR_NO_STOP' }
  | { readonly code: 'TOUR_TOO_LONG'; readonly maximum: number }
  | { readonly code: 'TOUR_STOP_TWICE' }
  | { readonly code: 'TOUR_PICKUP_NOT_OURS' }
  | { readonly code: 'TOUR_PICKUP_NOT_A_SITE' }
  | { readonly code: 'TOUR_PICKUP_NO_QUAY' }
  | { readonly code: 'NOTHING_TO_DELIVER' };

/** **Ce que l'appelant sait d'une exploitation visée** : à soi, une exploitation, et un quai dans
 *  sa région (`quayOfRegion(…) !== null`). Un site inconnu se lit comme pas à soi. */
export type PickupFacts = {
  readonly ours: boolean;
  readonly exploitation: boolean;
  readonly hasQuay: boolean;
};

/** **Ramasser à ce site ?** Le camion ramasse partout sur sa route (une route refusée est une
 *  attente du serveur), l'avion partout sans escale, le cargo là où la région a un quai. */
const pickupRefusalOf = (role: UnitRole, facts: PickupFacts | undefined) => {
  if (facts === undefined || !facts.ours) return { code: 'TOUR_PICKUP_NOT_OURS' } as const;
  if (!facts.exploitation) return { code: 'TOUR_PICKUP_NOT_A_SITE' } as const;
  if (role === 'cargo' && !facts.hasQuay) return { code: 'TOUR_PICKUP_NO_QUAY' } as const;
  return null;
};

/**
 * **Une tournée** (ADR 0028, précision du 18/10 ; ADR 0041 §2) : elle part de son point de
 * chargement et y revient, quatre arrêts au plus, chacun une fois, et ce qu'elle porte devient sa
 * consigne. Un dépôt donne, un site prend. Chaque dépôt se lit en plus par
 * `deliverRefusalOf(…, true)` ; chaque site, par les `sites` que l'appelant a lus.
 */
export function tourRefusalOf({
  role,
  place,
  busy,
  load,
  stops,
  sites = new Map(),
  baseOutpostId = null,
}: {
  readonly role: UnitRole;
  readonly place: LoadingPlace;
  readonly busy: Busy;
  readonly load: SupplyLoad | undefined;
  readonly stops: ReadonlyArray<TourStop>;
  readonly sites?: ReadonlyMap<string, PickupFacts>;
  readonly baseOutpostId?: string | null;
}): TourRefusal | null {
  if (loadCapacityOf(role) === 0) return { code: 'NOT_A_TRANSPORT' };
  const idle = idleRefusal(busy);
  if (idle !== null) return idle;
  const here = loadsHere(role, place);
  if (here?.code === 'LOAD_NOT_HERE') return { code: 'TOUR_NOT_AT_LOADING_POINT', role };
  if (here !== null) return here;
  if (stops.length === 0) return { code: 'TOUR_NO_STOP' };
  if (stops.length > TOUR_MAX_STOPS) return { code: 'TOUR_TOO_LONG', maximum: TOUR_MAX_STOPS };
  const keys = stops.map((stop) => `${stop.kind}:${stop.id}`);
  if (
    new Set(keys).size !== keys.length ||
    (baseOutpostId !== null && keys.includes(`depot:${baseOutpostId}`))
  )
    return { code: 'TOUR_STOP_TWICE' };
  for (const stop of stops) {
    if (stop.kind !== 'site') continue;
    const refused = pickupRefusalOf(role, sites.get(stop.id));
    if (refused !== null) return refused;
  }
  if (loadTotal(load) === 0 && !stops.some((stop) => stop.kind === 'site'))
    return { code: 'NOTHING_TO_DELIVER' };
  return null;
}

/** Une charge dont on a ôté `cost`, ressource par ressource, **dans l'ordre des transports** :
 *  le paquet largué se prend sur le premier avion qui l'a, puis sur le suivant. */
export function takeAcross(
  loads: ReadonlyArray<SupplyLoad>,
  cost: SupplyLoad,
): ReadonlyArray<SupplyLoad> {
  const owed = { ...cost };
  return loads.map((held) => {
    const left = { ...held };
    for (const key of SUPPLY_KEYS) {
      const n = Math.min(owed[key], left[key]);
      left[key] -= n;
      owed[key] -= n;
    }
    return left;
  });
}

/**
 * **Ce qu'un paquet largué rend à une escouade** (ADR 0028 §4) : ses coups et son plein, cran par
 * cran, dans l'ordre des identifiants et dans la limite de ce que chaque troupe porte. La même
 * recharge qu'à l'ancre (`topUp`), avec le paquet pour stock.
 */
export function airdropOnSquad(
  load: SupplyLoad,
  troops: ReadonlyArray<Carrying & { readonly id: string }>,
): { readonly taken: SupplyLoad; readonly supplies: ReadonlyMap<string, Supplies> } {
  const { cost, supplies } = topUp(
    troops.map((troop) => ({ ...troop, anchored: true })),
    load,
  );
  return { taken: cost, supplies };
}

/** **Une escouade comme le largage la lit** : ses troupes, ancrées ou non, et ce qu'elles portent
 *  de coups et de plein. La rose (sur la vue) et le serveur (sur les lignes) la bâtissent ici. */
export const squadTarget = (
  troops: ReadonlyArray<{
    readonly id: string;
    readonly role: UnitRole;
    readonly supplies?: Supplies | undefined;
    readonly anchored: boolean;
  }>,
): Extract<AirdropTarget, { kind: 'squad' }> => ({
  kind: 'squad',
  troops: troops.map(({ id, role, supplies, anchored }) => ({ id, role, ...supplies, anchored })),
});

export type AirdropTarget =
  | {
      readonly kind: 'outpost';
      readonly standing: boolean;
      readonly depot: SupplyLoad;
      readonly capacity: number;
    }
  | {
      readonly kind: 'squad';
      readonly troops: ReadonlyArray<
        Carrying & { readonly id: string; readonly anchored: boolean }
      >;
    };

export type AirdropRefusal =
  | { readonly code: 'NOTHING_TO_DELIVER' }
  | { readonly code: 'AIRDROP_AIR_ONLY' }
  | { readonly code: 'DEPOT_NOT_STANDING' }
  | { readonly code: 'DEPOT_FULL'; readonly capacity: number }
  | { readonly code: 'NO_SQUAD_THERE' }
  | { readonly code: 'SQUAD_ANCHORED' }
  | { readonly code: 'SQUAD_SUPPLIED' };

/**
 * **Les coques d'une colonne** : les troupes qui ne sont pas à bord d'une autre de la colonne.
 * Un largage les lit toutes — un camion, même vide, ou un chasseur dans la main refuse l'ordre,
 * faute de quoi il suivrait l'avion et paierait le double plein.
 */
export const hullsAmong = <T extends Seated>(troops: ReadonlyArray<T>): T[] =>
  troops.filter((troop) => carrierIn(troop, troops) === null);

/**
 * **Larguer** (ADR 0028 §4) : l'avion chargé ne se pose pas, il lâche un paquet sur un de ses
 * avant-postes — escale ou non —, ou sur une de ses escouades isolées, qui reprend ses coups et
 * son plein. Une escouade ancrée se recharge seule ; une escouade pleine n'a que faire du paquet.
 * La rose le lit avant le lâcher, `logistics.airdrop` et l'arrivée le relisent.
 */
export function airdropRefusalOf(
  transports: ReadonlyArray<{ readonly role: UnitRole; readonly load?: SupplyLoad }>,
  target: AirdropTarget,
): AirdropRefusal | null {
  if (transports.some((transport) => transport.role !== 'airTransport'))
    return { code: 'AIRDROP_AIR_ONLY' };
  const loaded = transports.filter((transport) => loadTotal(transport.load) > 0);
  if (loaded.length === 0) return { code: 'NOTHING_TO_DELIVER' };
  if (target.kind === 'outpost') {
    if (!target.standing) return { code: 'DEPOT_NOT_STANDING' };
    return loadTotal(target.depot) >= target.capacity
      ? { code: 'DEPOT_FULL', capacity: target.capacity }
      : null;
  }
  if (target.troops.length === 0) return { code: 'NO_SQUAD_THERE' };
  if (target.troops.some((troop) => troop.anchored)) return { code: 'SQUAD_ANCHORED' };
  const packet = loaded.reduce((sum, transport) => addLoads(sum, transport.load!), emptyLoad());
  return loadTotal(airdropOnSquad(packet, target.troops).taken) === 0
    ? { code: 'SQUAD_SUPPLIED' }
    : null;
}
