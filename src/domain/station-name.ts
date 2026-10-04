import { countryLabel, fr } from '@/i18n/fr';
import type { PlayerView, TroopStation } from './player-view';

/**
 * **What an address is called, in the two lengths a screen ever needs.** It left the troops
 * widget with the widget itself: the naming outlived the inventory, because two surfaces still
 * print an address — the army section of the nation sheet, and the lines of « à faire
 * maintenant ».
 *
 * `full` is the sentence of a list one reads: "Caserne · Bouches-du-Rhône", "garnison —
 * Arabie saoudite". `place` is the tail of a line that already says what it is about — "1 troupe
 * sans ordre — Piémont" — where "en campagne — Piémont" would say *en campagne* twice.
 *
 * A station the view no longer carries falls back to home rather than printing an id.
 */
export type StationNames = {
  readonly full: (station: TroopStation) => string;
  readonly place: (station: TroopStation) => string;
};

export function stationNames(view: Pick<PlayerView, 'me'>): StationNames {
  const buildings = new Map(view.me.buildings.map((building) => [building.id, building]));
  const regions = new Map(view.me.regions.map((region) => [region.id, region.name]));
  const outposts = new Map(view.me.outposts.map((outpost) => [outpost.id, outpost]));

  const buildingName = (buildingId: string): string | null => {
    const building = buildings.get(buildingId);
    if (building === undefined) return null;
    const region = regions.get(building.regionId);
    return region === undefined ? building.name : `${building.name} · ${region}`;
  };

  return {
    full: (station) => {
      if (station.kind === 'home') return fr.troops.atHome;
      if (station.kind === 'point') {
        return station.country === '' ? fr.troops.postedAtSea : fr.troops.postedAt(station.country);
      }
      if (station.kind === 'outpost') {
        const outpost = outposts.get(station.outpostId);
        return outpost ? fr.troops.garrisonAt(outpost.hostCountry) : fr.troops.atHome;
      }
      return buildingName(station.buildingId) ?? fr.troops.atHome;
    },
    place: (station) => {
      if (station.kind === 'home') return fr.troops.atHome;
      if (station.kind === 'point') {
        return station.country === '' ? fr.troops.atSea : countryLabel(station.country);
      }
      if (station.kind === 'outpost') {
        const outpost = outposts.get(station.outpostId);
        return outpost ? countryLabel(outpost.hostCountry) : fr.troops.atHome;
      }
      const building = buildings.get(station.buildingId);
      const region = building === undefined ? undefined : regions.get(building.regionId);
      return region ?? buildingName(station.buildingId) ?? fr.troops.atHome;
    },
  };
}
