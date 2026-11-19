import type { FamilySpot } from '@/domain/family-cycle';
import type { MapMarker } from '@/domain/labels';
import type { PlayerView } from '@/domain/player-view';
import { hasSiteSheet, stationKeyOf, troopsAt, type MarchStation } from '@/domain/troops';

/**
 * **Les familles de fiches du téléphone** (#593) : ce que ‹ et › parcourent, lu sur les marqueurs
 * que la carte dessine — ce qui n'est pas posé (couche éteinte, relevé périmé) n'a pas de fiche à
 * atteindre. Chaque objet est nommé par l'id que porte sa fiche ouverte : la clé de sa station
 * pour une pile, l'id du bâtiment, de l'avant-poste, du camp, de l'objectif ou du point.
 *
 * En Blitz, une pile n'a pas de ‹ › : le toucher y fait défiler les unités.
 */
export type Families = {
  readonly pile: ReadonlyArray<FamilySpot>;
  /** L'adresse de chaque pile de la famille, par sa clé : ce que lève › . */
  readonly stations: ReadonlyMap<string, MarchStation>;
  readonly building: ReadonlyArray<FamilySpot>;
  readonly outpost: ReadonlyArray<FamilySpot>;
  readonly camp: ReadonlyArray<FamilySpot>;
  readonly objective: ReadonlyArray<FamilySpot>;
  readonly point: ReadonlyArray<FamilySpot>;
};

export function familiesOf(
  view: Pick<PlayerView, 'me' | 'mode'>,
  markers: ReadonlyArray<MapMarker>,
  marching: ReadonlySet<string>,
): Families {
  const pile: FamilySpot[] = [];
  const stations = new Map<string, MarchStation>();
  const stand = (station: MarchStation, lonLat: FamilySpot['lonLat']) => {
    const id = stationKeyOf(station);
    pile.push({ id, lonLat });
    stations.set(id, station);
  };
  const building: FamilySpot[] = [];
  const outpost: FamilySpot[] = [];
  const camp: FamilySpot[] = [];
  const objective: FamilySpot[] = [];
  const point: FamilySpot[] = [];
  const stands = (key: string) => troopsAt(view.me, key, marching).length > 0;
  for (const marker of markers) {
    const { lonLat } = marker;
    /** Sans point, rien n'est posé sur la carte. */
    if (lonLat === null) continue;
    switch (marker.kind) {
      case 'stack':
        if (marker.station.kind !== 'home') stand(marker.station, lonLat);
        break;
      case 'building':
        if (marker.buildingId === null) break;
        if (hasSiteSheet(view.mode, marker.key)) building.push({ id: marker.buildingId, lonLat });
        if (stands(`building:${marker.buildingId}`))
          stand({ kind: 'building', buildingId: marker.buildingId }, lonLat);
        break;
      case 'outpost':
        outpost.push({ id: marker.station.outpostId, lonLat });
        if (stands(stationKeyOf(marker.station))) stand(marker.station, lonLat);
        break;
      case 'camp':
        camp.push({ id: marker.campId, lonLat });
        break;
      case 'objective':
        objective.push({ id: marker.objectiveId, lonLat });
        break;
      case 'strategic':
        point.push({ id: marker.pointId, lonLat });
        break;
      default:
        break;
    }
  }
  return {
    pile: view.mode === 'blitz' ? [] : pile,
    stations,
    building,
    outpost,
    camp,
    objective,
    point,
  };
}
