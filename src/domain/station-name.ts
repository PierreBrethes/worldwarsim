import { countryLabel, fr } from '@/i18n/fr';
import type { LonLat } from './geo';
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
/**
 * **Ce que le serveur nomme d'un lieu, mis en français.** Un nom de lieu arrive soit en nom propre
 * de région — Natural Earth, rien à traduire —, soit, faute de région (un point en mer, hors de
 * tout admin-1), en **code** du pays sous lui : le serveur ne renvoie pas de phrase (ADR 0016).
 * La chaîne vide est la mer. C'est la seule traduction de ces noms : la vue des mouvements et
 * l'aperçu passent par elle, sans quoi un écran imprimait « FRA ».
 */
export const placeLabel = (name: string): string =>
  name === '' ? fr.troops.atSea : countryLabel(name);

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

/** La région sous un point, telle que la couche admin-1 chargée la connaît — `null` tant qu'elle
 *  n'est pas arrivée, ou hors de toute région. */
export type RegionAt = (lonLat: LonLat) => { readonly name: string } | null;

/**
 * **Le cartouche d'une pile nomme sa région** (« Piémont · 3 »), et retombe sur le pays de
 * `place` en deux cas seulement : une coque à flot — le polygone d'une région côtière déborde sur
 * l'eau, et une flotte au large n'est pas « dans le Nord » —, et une couche de régions pas encore
 * chargée, ces 500 Ko arrivant après le plateau.
 */
export function pilePlace(
  station: Extract<TroopStation, { kind: 'point' }>,
  names: StationNames,
  regionAt: RegionAt | null,
): string {
  if (station.afloat || regionAt === null) return names.place(station);
  return regionAt(station.lonLat)?.name ?? names.place(station);
}
