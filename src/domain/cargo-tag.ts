// **L'étiquette d'un transport** (POC « Manipuler les pions », 16/10/2026) : pendue à la pile,
// elle dit qui est à bord et ce qui reste de place, et c'est d'elle qu'on tire un passager
// pour le faire descendre. Remplace le jeton « N à bord ».
import type { UnitRole, UnitTier } from './ids';
import {
  boardingRefusalOf,
  disembarkRefusalOf,
  type BoardingRefusal,
  type DisembarkRefusal,
} from './movement-orders';
import { carrierIn, fareOf, seatsLeft, seatsOf, type Seated } from './troops';

type Aboard = Seated & { readonly tier: UnitTier };

export type CargoTag = {
  readonly carrierId: string;
  readonly role: UnitRole;
  readonly seats: number;
  readonly used: number;
  /** Ceux qui sont assis dans ce transport-ci — un camion à bord d'une coque compte pour un —,
   *  et les places que chacun y tient : un blindé en prend trois. */
  readonly riders: ReadonlyArray<{
    readonly id: string;
    readonly role: UnitRole;
    readonly tier: UnitTier;
    readonly seats: number;
  }>;
  /** Pourquoi personne ne peut descendre ici, `null` quand on le peut : la règle même de
   *  `movements.disembark` (`disembarkRefusalOf`). */
  readonly refusal: DisembarkRefusal | null;
};

/** Une étiquette par transport de la pile, dans l'ordre de la pile — un vide aussi : la main y
 *  lit ses places libres (POC, `avail`). Ce qui la montre est l'affaire de la carte. */
export function cargoTagsOf<T extends Aboard>(
  pile: ReadonlyArray<T>,
  where: { readonly afloat: boolean; readonly atAirfield: boolean },
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
 * **Les transports d'une pile qui prendraient la main** (POC, `avail`) : le genre suffit — un
 * camion n'assoit que l'infanterie —, les places et l'aérodrome se lisent sur leur étiquette.
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
