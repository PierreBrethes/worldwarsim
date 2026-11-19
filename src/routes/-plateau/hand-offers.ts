import { atAirfieldOf } from '@/domain/compass-logistics';
import type { CompassTarget } from '@/domain/compass-rose';
import type { DisbandGround } from '@/domain/movement-orders';
import { offersOf, type Offer, type OfferContext } from '@/domain/offers';
import type { PlayerView } from '@/domain/player-view';
import { stationKeyOf, type MarchStation } from '@/domain/troops';

/**
 * **Les faits de l'instant que `offersOf` ne lit pas dans la vue** : l'heure, la géographie de la
 * couronne, et si la pile flotte ou dort sur un aérodrome. Tout vient de ce que le plateau lit
 * déjà (`atAirfieldOf`, `disbandGround`) : aucun fait de plus.
 */
export function offerContextOf(
  view: PlayerView,
  station: MarchStation,
  now: number,
  ground: DisbandGround | null,
): OfferContext {
  return {
    now,
    ground,
    afloat: station.kind === 'point' && station.afloat,
    atAirfield: atAirfieldOf(view.me.buildings, station),
  };
}

/**
 * **Les ordres de la pile en main** : lue sur sa cible de pile posée quand la carte l'a lue (c'est
 * elle qui dit la région et le sol, donc « fonder »), sinon comme une garnison.
 */
export function handOffersOf(
  view: PlayerView,
  hand: { readonly station: MarchStation; readonly troopIds: ReadonlyArray<string> },
  target: CompassTarget | null,
  now: number,
  ground: DisbandGround | null,
): ReadonlyArray<Offer> {
  const ctx = offerContextOf(view, hand.station, now, ground);
  if (
    target?.kind === 'force' &&
    target.station !== null &&
    stationKeyOf(target.station) === stationKeyOf(hand.station)
  )
    return offersOf({ ...target, troopIds: hand.troopIds }, view, ctx);
  return offersOf({ kind: 'garrison', station: hand.station, troopIds: hand.troopIds }, view, ctx);
}
