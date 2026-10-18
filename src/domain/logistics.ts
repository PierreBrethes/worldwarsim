import { AIR_STOP_LEVEL, LOAD_CAPACITY_BY_ROLE, TOUR_MAX_STOPS } from '../../convex/constants';
import type { BuildingKey, ResourceKey, UnitRole } from './ids';
import type { SupplyStocks } from './supplies';

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

export const isSupplyKey = (key: ResourceKey): key is keyof SupplyLoad =>
  (SUPPLY_KEYS as ReadonlyArray<string>).includes(key);

/** **Où chaque transport se charge** (Q29) : un camion au QG ou à un entrepôt, un cargo au port,
 *  un avion à l'aérodrome ; ailleurs, au dépôt de l'avant-poste où il se tient. */
const LOADS_AT: Partial<Record<UnitRole, ReadonlyArray<BuildingKey>>> = {
  landTransport: ['hq', 'warehouse'],
  cargo: ['port'],
  airTransport: ['airfield'],
};

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

/** **Un avion ne se pose qu'à une escale** (ADR 0028 §5) : un avant-poste de niveau 2. */
const airStopRefusal = (role: UnitRole, level: number) =>
  role === 'airTransport' && level < AIR_STOP_LEVEL
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
const loadsHere = (role: UnitRole, place: LoadingPlace) => {
  if (place.kind === 'outpost') return airStopRefusal(role, place.level);
  if (place.kind === 'elsewhere' || !(LOADS_AT[role] ?? []).includes(place.key))
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
  resource,
  amount,
  store,
}: {
  readonly role: UnitRole;
  readonly place: LoadingPlace;
  readonly busy: Busy;
  readonly held: SupplyLoad;
  readonly resource: ResourceKey;
  readonly amount: number;
  readonly store: number;
}): LoadRefusal | null {
  const capacity = loadCapacityOf(role);
  if (capacity === 0) return { code: 'NOT_A_TRANSPORT' };
  if (!isSupplyKey(resource)) return { code: 'LOAD_NOT_A_SUPPLY' };
  const idle = idleRefusal(busy);
  if (idle !== null) return idle;
  const here = loadsHere(role, place);
  if (here !== null) return here;
  const room = capacity - loadTotal(held);
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

/** **Ce que la tournée remonte à bord** pour retrouver sa consigne. */
export const missingOf = (consigne: SupplyLoad, held: SupplyLoad): SupplyLoad => ({
  ammunition: Math.max(0, consigne.ammunition - held.ammunition),
  oil: Math.max(0, consigne.oil - held.oil),
  coal: Math.max(0, consigne.coal - held.coal),
});

/** **Les arrêts qu'un tour visite vraiment** : un dépôt qui ne prendrait rien de ce qui reste à
 *  bord est sauté. */
export function visitPlan<T extends string>(
  load: SupplyLoad,
  stops: ReadonlyArray<{ readonly id: T; readonly depot: SupplyLoad; readonly capacity: number }>,
): { readonly visit: ReadonlyArray<T>; readonly skipped: ReadonlyArray<T> } {
  let left = load;
  const visit: Array<T> = [];
  const skipped: Array<T> = [];
  for (const stop of stops) {
    const { moved, kept } = deliveryOf(left, stop.depot, stop.capacity);
    if (loadTotal(moved) === 0) skipped.push(stop.id);
    else {
      visit.push(stop.id);
      left = kept;
    }
  }
  return { visit, skipped };
}

/** **Une prise de jetons** (prototype v3) : glisser prend 10 ; l'appui maintenu accélère, 10 par
 *  10 jusqu'à 50, puis 50 par 50. */
export const GRAB_STEP = 10;
const GRAB_TICK_MS = 200;

export function grabbedAfter(heldMs: number): number {
  const ticks = Math.max(0, Math.floor(heldMs / GRAB_TICK_MS));
  return ticks <= 4 ? GRAB_STEP * (1 + ticks) : 50 * (ticks - 3);
}

export type TourRefusal =
  | { readonly code: 'NOT_A_TRANSPORT' }
  | { readonly code: 'TRANSPORT_UNDERWAY' }
  | { readonly code: 'TRANSPORT_ON_TOUR' }
  | { readonly code: 'TOUR_NOT_AT_LOADING_POINT'; readonly role: UnitRole }
  | { readonly code: 'NO_AIR_STOP'; readonly level: number }
  | { readonly code: 'TOUR_TOO_LONG'; readonly maximum: number }
  | { readonly code: 'TOUR_STOP_TWICE' }
  | { readonly code: 'NOTHING_TO_DELIVER' };

/**
 * **Une tournée** (ADR 0028, précision du 18/10) : elle part de son point de chargement et y
 * revient, quatre dépôts au plus, chacun une fois, et ce qu'elle porte devient sa consigne.
 * Chaque arrêt se lit en plus par `deliverRefusalOf(…, true)`.
 */
export function tourRefusalOf({
  role,
  place,
  busy,
  load,
  stops,
  baseOutpostId = null,
}: {
  readonly role: UnitRole;
  readonly place: LoadingPlace;
  readonly busy: Busy;
  readonly load: SupplyLoad | undefined;
  readonly stops: ReadonlyArray<string>;
  readonly baseOutpostId?: string | null;
}): TourRefusal | null {
  if (loadCapacityOf(role) === 0) return { code: 'NOT_A_TRANSPORT' };
  const idle = idleRefusal(busy);
  if (idle !== null) return idle;
  const here = loadsHere(role, place);
  if (here?.code === 'LOAD_NOT_HERE') return { code: 'TOUR_NOT_AT_LOADING_POINT', role };
  if (here !== null) return here;
  if (stops.length === 0 || stops.length > TOUR_MAX_STOPS)
    return { code: 'TOUR_TOO_LONG', maximum: TOUR_MAX_STOPS };
  if (
    new Set(stops).size !== stops.length ||
    (baseOutpostId !== null && stops.includes(baseOutpostId))
  )
    return { code: 'TOUR_STOP_TWICE' };
  if (loadTotal(load) === 0) return { code: 'NOTHING_TO_DELIVER' };
  return null;
}
