import type { MapMarker } from '@/domain/labels';
import { depositOfRegion } from '@/domain/world';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import type { StandingMaquette } from '@/map/engine';
import { buildMinutes } from '../../../convex/constants';

/**
 * **What stands in maquettes up close, among the markers on the board** (ADR 0026 §1): what is
 * drawn today by its plate, and nothing more — my standing buildings, the installations I
 * surveyed, the neutral objectives. A first level under the crane rises with its work, by the
 * scale of a first level — the one the server dated it by. An upgrade keeps its building whole,
 * and the crane beside it: what already stands is not raised again.
 */
export function maquettesOf(
  markers: ReadonlyArray<MapMarker>,
  objectiveKey: (objectiveId: string) => string | undefined,
  /** My buildings that produce right now (`producingSites`): they smoke. */
  producing: ReadonlySet<string> = new Set(),
): StandingMaquette[] {
  return markers.flatMap((marker): StandingMaquette[] => {
    const standing = (
      at: StandingMaquette['at'],
      url: string | null,
      washed = false,
      rising?: StandingMaquette['rising'],
      smoking = false,
    ) =>
      url === null
        ? []
        : [
            {
              id: marker.id,
              at,
              url,
              washed,
              ...(rising && { rising }),
              ...(smoking && { smoking }),
            },
          ];
    switch (marker.kind) {
      case 'building':
        return standing(
          marker.lonLat === null ? { regionId: marker.regionId } : { lonLat: marker.lonLat },
          buildingMaquette(marker.key, depositOfRegion(marker.regionId)),
          false,
          marker.level === null && marker.finishesAt !== null
            ? { finishesAt: Math.round(marker.finishesAt), minutes: buildMinutes(marker.key, 1) }
            : undefined,
          marker.buildingId !== null && producing.has(marker.buildingId),
        );
      case 'installation':
        return standing(
          { regionId: marker.regionId },
          buildingMaquette(marker.key, depositOfRegion(marker.regionId)),
          marker.washed,
        );
      case 'objective': {
        // Emptied, it stands whole as its plate does: the cartouche says it is empty.
        const key = objectiveKey(marker.objectiveId);
        return key === undefined ? [] : standing({ lonLat: marker.lonLat }, objectiveMaquette(key));
      }
      default:
        return [];
    }
  });
}
