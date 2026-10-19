// **L'étiquette d'un transport** (POC « Manipuler les pions », 16/10/2026) : pendue à la pile,
// elle dit qui est à bord et ce qui reste de place, et c'est d'elle qu'on tire un passager
// pour le faire descendre. Remplace le jeton « N à bord ».
import type { UnitRole, UnitTier } from './ids';
import { emptyLoad, loadCapacityOf, type SupplyLoad } from './logistics';
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
  readonly tour?: Pick<NonNullable<TroopView['tour']>, 'stops' | 'waiting' | 'recalled'>;
};

/** **Ce que l'étiquette dit de la tournée** (ADR 0028) : en tracé, en route, en attente et
 *  pourquoi, rappelée. */
export type TagTour = {
  readonly state: 'tracing' | 'running' | 'waiting' | 'recalled';
  readonly stops: number;
  readonly waiting: TourWait | null;
};

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
    /** La tournée que la main trace, s'il y en a une : son transport le dit sur son étiquette. */
    readonly trace?: { readonly carrierId: string; readonly stops: ReadonlyArray<string> } | null;
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
        loadCapacity: loadCapacityOf(carrier.role),
        tour:
          where.trace?.carrierId === carrier.id
            ? {
                state: 'tracing' as const,
                stops: where.trace.stops.length,
                waiting: null,
              }
            : carrier.tour === undefined
              ? null
              : {
                  state: carrier.tour.recalled
                    ? ('recalled' as const)
                    : carrier.tour.waiting !== null
                      ? ('waiting' as const)
                      : ('running' as const),
                  stops: carrier.tour.stops.length,
                  waiting: carrier.tour.waiting,
                },
      },
    ];
  });
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
