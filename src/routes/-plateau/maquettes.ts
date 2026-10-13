import type { MapMarker } from '@/domain/labels';
import { depositOfRegion } from '@/domain/world';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import type { StandingMaquette } from '@/map/engine';

/**
 * **What stands in maquettes up close, among the markers on the board** (ADR 0026 §1): what is
 * drawn today by its plate, and nothing more — my standing buildings, the installations I
 * surveyed, the neutral objectives. A first level under the crane keeps its crane: nothing
 * stands there yet. An upgrade keeps its building, and the crane beside it.
 */
export function maquettesOf(
  markers: ReadonlyArray<MapMarker>,
  objectiveKey: (objectiveId: string) => string | undefined,
): StandingMaquette[] {
  return markers.flatMap((marker): StandingMaquette[] => {
    const standing = (at: StandingMaquette['at'], url: string | null, washed = false) =>
      url === null ? [] : [{ id: marker.id, at, url, washed }];
    switch (marker.kind) {
      case 'building':
        if (marker.level === null) return [];
        return standing(
          marker.lonLat === null ? { regionId: marker.regionId } : { lonLat: marker.lonLat },
          buildingMaquette(marker.key, depositOfRegion(marker.regionId)),
        );
      case 'installation':
        return standing(
          { regionId: marker.regionId },
          buildingMaquette(marker.key, depositOfRegion(marker.regionId)),
          marker.washed,
        );
      case 'objective':
        return standing(
          { lonLat: marker.lonLat },
          objectiveMaquette(objectiveKey(marker.objectiveId) ?? ''),
          marker.emptied,
        );
      default:
        return [];
    }
  });
}
