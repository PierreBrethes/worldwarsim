import { distanceKm, type LonLat } from '@/domain/geo';
import type { OfferPile } from '@/domain/offers';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { pilePlace, stationNames, type RegionAt } from '@/domain/station-name';
import { marchingTroopIds, stationKeyOf, stationPointOf, type MarchStation } from '@/domain/troops';

/**
 * **Les piles que la fiche d'une cible propose d'envoyer** (#588) : chaque adresse où des troupes
 * se tiennent à l'arrêt, la plus proche de la cible d'abord. Une troupe en marche n'est à aucune
 * adresse ; un vaincu n'envoie plus rien (`requirePlayable`). Le lieu est celui de la fiche de la
 * pile en main : la région sous un point, jamais un second nom.
 */
export function offerPilesOf(
  view: PlayerView,
  regionAt: RegionAt | null,
  target: LonLat,
): ReadonlyArray<OfferPile> {
  if (view.me.defeated) return [];
  const marching = marchingTroopIds(view.arcs);
  const names = stationNames(view);
  const piles = new Map<string, { station: MarchStation; troops: TroopView[] }>();
  for (const troop of view.me.troops) {
    const station = troop.stationedAt;
    if (marching.has(troop.id) || station.kind === 'home') continue;
    const key = stationKeyOf(station);
    const pile = piles.get(key);
    if (pile === undefined) piles.set(key, { station, troops: [troop] });
    else pile.troops.push(troop);
  }
  return [...piles.values()]
    .map(({ station, troops }) => ({
      pile: {
        station,
        troopIds: troops.map((troop) => troop.id),
        place:
          station.kind === 'point' ? pilePlace(station, names, regionAt) : names.place(station),
      },
      km: distanceKm(stationPointOf(view.me, station) ?? target, target),
    }))
    .sort((a, b) => a.km - b.km)
    .map(({ pile }) => pile);
}
