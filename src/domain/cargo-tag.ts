// **L'étiquette d'un transport** (POC « Manipuler les pions », 16/10/2026) : pendue à la pile,
// elle dit qui est à bord et ce qui reste de place, et c'est d'elle qu'on tire un passager
// pour le faire descendre. Remplace le jeton « N à bord ».
import type { UnitRole, UnitTier } from './ids';
import { emptyStocks } from './economy';
import { emptyLoad, loadCapacityOf, type HarvestLoad, type SupplyLoad } from './logistics';
import {
  boardingRefusalOf,
  disembarkRefusalOf,
  type BoardingRefusal,
  type DisembarkRefusal,
} from './movement-orders';
import { carrierIn, fareOf, seatsLeft, seatsOf, type Seated } from './troops';
import type { TourWait, TroopView } from './player-view';

type Aboard = Seated & {
  readonly tier: UnitTier;
  readonly load?: SupplyLoad;
  readonly harvest?: HarvestLoad;
  readonly tour?: Pick<NonNullable<TroopView['tour']>, 'stops' | 'waiting' | 'recalled' | 'veiled'>;
};

/** **Ce que l'étiquette dit de la tournée** (ADR 0028) : en route, en attente et pourquoi,
 *  rappelée. */
export type TagTour = {
  readonly state: 'running' | 'waiting' | 'recalled';
  readonly stops: number;
  readonly waiting: TourWait | null;
  readonly veiled?: true;
};

/** **Ce que l'étiquette fait de la tournée** : ouvrir la feuille de route du transport (#551), ou
 *  rappeler la tournée qui tourne. */
export type TourAct = 'open' | 'recall';

export type CargoTag = {
  readonly carrierId: string;
  readonly role: UnitRole;
  readonly seats: number;
  readonly used: number;
  /** Who sits in this very transport — a truck aboard a hull counts as one — and the seats each
   *  takes: a tank takes three. */
  readonly riders: ReadonlyArray<{
    readonly id: string;
    readonly role: UnitRole;
    readonly tier: UnitTier;
    readonly seats: number;
  }>;
  /** Pourquoi personne ne peut descendre ici, `null` quand on le peut : la règle même de
   *  `movements.disembark` (`disembarkRefusalOf`). */
  readonly refusal: DisembarkRefusal | null;
  /** **Sa charge** (ADR 0028 §4), dans sa seule capacité : munitions, pétrole, charbon. */
  readonly load: SupplyLoad;
  /** **Sa récolte à bord** (ADR 0041 §2), sous la même capacité : la place qui reste la compte. */
  readonly harvest: HarvestLoad;
  readonly loadCapacity: number;
  readonly tour: TagTour | null;
};

/** A tag per transport of the pile, in the pile's order — an empty one too: the hand reads its free
 *  seats on it (POC, `avail`). When it shows is the map's business. */
export function cargoTagsOf<T extends Aboard>(
  pile: ReadonlyArray<T>,
  where: {
    readonly afloat: boolean;
    readonly atAirfield: boolean;
  },
): ReadonlyArray<CargoTag> {
  return pile.flatMap((carrier) => {
    if (seatsOf(carrier.role) === 0) return [];
    const riders = pile.filter((troop) => carrierIn(troop, pile)?.id === carrier.id);
    return [
      {
        carrierId: carrier.id,
        role: carrier.role,
        seats: seatsOf(carrier.role),
        used: seatsOf(carrier.role) - seatsLeft(carrier, pile),
        riders: riders.map((rider) => ({
          id: rider.id,
          role: rider.role,
          tier: rider.tier,
          seats: fareOf(carrier.role, rider, pile) ?? 1,
        })),
        refusal: disembarkRefusalOf({
          carrier: riders.length === 0 ? null : carrier.role,
          ...where,
        }),
        load: carrier.load ?? emptyLoad(),
        harvest: carrier.harvest ?? emptyStocks(),
        loadCapacity: loadCapacityOf(carrier.role),
        tour:
          carrier.tour === undefined
            ? null
            : {
                state: carrier.tour.recalled
                  ? ('recalled' as const)
                  : carrier.tour.waiting !== null
                    ? ('waiting' as const)
                    : ('running' as const),
                stops: carrier.tour.stops.length,
                waiting: carrier.tour.waiting,
                ...(carrier.tour.veiled === true ? { veiled: true as const } : {}),
              },
      },
    ];
  });
}

/**
 * **The tag a boarding has not filled yet** (#504): without the riders `held` still keeps off it,
 * and their seats. Nothing held is the tag itself (the same object: the labels stay shared).
 */
export function heldBack(tag: CargoTag, held: ReadonlySet<string> | undefined): CargoTag {
  if (held === undefined || !tag.riders.some((rider) => held.has(rider.id))) return tag;
  const riders = tag.riders.filter((rider) => !held.has(rider.id));
  return {
    ...tag,
    riders,
    used: riders.reduce((sum, rider) => sum + rider.seats, 0),
    // What a view with nobody aboard serves (`cargoTagsOf`).
    refusal: riders.length === 0 ? 'NOT_ABOARD' : tag.refusal,
  };
}

/** **What is held once `riders` of `carrierId` are fed** (#504): the same map when none of them
 *  was held, a hull with nobody left held is forgotten. */
export function fedRiders(
  held: ReadonlyMap<string, ReadonlySet<string>>,
  carrierId: string,
  riders: ReadonlyArray<string>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const before = held.get(carrierId);
  const left = new Set(before);
  for (const rider of riders) left.delete(rider);
  if (before === undefined || left.size === before.size) return held;
  const next = new Map(held);
  if (left.size === 0) next.delete(carrierId);
  else next.set(carrierId, left);
  return next;
}

/** **The labels as a boarding in progress shows them** (#504): `held` is, per carrier, the
 *  riders its tag has not been fed yet. */
export function heldLabels<T extends { readonly cargo?: ReadonlyArray<CargoTag> }>(
  labels: ReadonlyArray<T>,
  held: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyArray<T> {
  if (held.size === 0) return labels;
  return labels.map((label) =>
    label.cargo === undefined
      ? label
      : { ...label, cargo: label.cargo.map((tag) => heldBack(tag, held.get(tag.carrierId))) },
  );
}

/** What a seat count or an airfield decides, and the tag says: the kind of transport still fits. */
const SEATED_LATER: ReadonlySet<BoardingRefusal | null> = new Set([
  null,
  'NOT_ENOUGH_LIFT',
  'AIRFIELD_BOARDING_ONLY',
]);

/**
 * **The transports of a pile that would take the hand** (POC, `avail`): the kind is enough — a
 * truck seats infantry only —, the seats and the airfield are read on their tag.
 */
export function carriersFor<T extends Seated>(held: ReadonlyArray<T>, pile: ReadonlyArray<T>): T[] {
  const riders = held.filter((troop) => carrierIn(troop, held) === null);
  return pile.filter(
    (carrier) =>
      seatsOf(carrier.role) > 0 &&
      !held.some((troop) => troop.id === carrier.id) &&
      SEATED_LATER.has(boardingRefusalOf({ riders, carrier, pile, atAirfield: false })),
  );
}
